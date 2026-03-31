import {
  loadAuthProfileStoreForRuntime,
  resolveAuthProfileOrder,
  saveAuthProfileStore,
  type ApiKeyCredential,
  type AuthProfileStore,
  type TokenCredential,
} from "../../agents/auth-profiles.js";
import { updateAuthProfileStoreWithLock } from "../../agents/auth-profiles/store.js";
import { isLocalGatewayAddress } from "../net.js";
import {
  ErrorCodes,
  errorShape,
  validateKeysDeleteParams,
  validateKeysListParams,
  validateKeysReloadParams,
  validateKeysSetActiveParams,
  validateKeysSetParams,
  validateModelSetDefaultParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";
import { assertValidParams } from "./validation.js";
import {
  applyAuthProfileConfigOverlay,
  buildApiKeyEntries,
  buildManagedProfileId,
  extractCredentialSecret,
  getCredentialBaseUrl,
  isManagedApiKeyProvider,
  normalizeManagedProvider,
  resolvePreferredModelForProvider,
  setConfiguredDefaultModel,
  upsertProviderBaseUrlConfig,
  validateProviderSecret,
  type ManagedApiKeyProvider,
} from "../api-keys.shared.js";
import { loadConfig, type OpenClawConfig, writeConfigFile } from "../../config/config.js";
import type { ModelCatalogEntry } from "../../agents/model-catalog.js";

type KeysSetParams = {
  provider: string;
  key?: string;
  baseUrl?: string;
  label?: string;
  profileId?: string;
};

type KeysDeleteParams = {
  profileId: string;
};

type KeysSetActiveParams = {
  profileId: string;
};

type ModelSetDefaultParams = {
  modelId: string;
};

type KeysListEntry = ReturnType<typeof buildApiKeyEntries>[number];

function readFreshStore(): AuthProfileStore {
  return structuredClone(loadAuthProfileStoreForRuntime(undefined, { readOnly: true }));
}

function requireLocalAuthenticatedWrite(clientIp: string | undefined) {
  return isLocalGatewayAddress(clientIp);
}

function providerModeForCredential(credential: "api_key" | "token"): "api_key" | "token" {
  return credential === "token" ? "token" : "api_key";
}

function ensureManagedProvider(providerRaw: string): ManagedApiKeyProvider {
  const provider = normalizeManagedProvider(providerRaw);
  if (!provider) {
    throw new Error(`Unsupported provider "${providerRaw}".`);
  }
  return provider;
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeProfileOrder(params: {
  store: AuthProfileStore;
  cfg: OpenClawConfig;
  provider: ManagedApiKeyProvider;
  selectedProfileId: string;
}): { store: AuthProfileStore; cfg: OpenClawConfig } {
  const existing = resolveAuthProfileOrder({
    cfg: params.cfg,
    store: params.store,
    provider: params.provider,
  }).filter((profileId) => profileId !== params.selectedProfileId);
  const order = [params.selectedProfileId, ...existing];
  const normalizedProvider = params.provider;
  const nextStore: AuthProfileStore = {
    ...params.store,
    order: {
      ...(params.store.order ?? {}),
      [normalizedProvider]: order,
    },
  };
  const nextCfg: OpenClawConfig = {
    ...params.cfg,
    auth: {
      ...(params.cfg.auth ?? {}),
      profiles: {
        ...(params.cfg.auth?.profiles ?? {}),
      },
      order: {
        ...(params.cfg.auth?.order ?? {}),
        [normalizedProvider]: order,
      },
    },
  };
  return { store: nextStore, cfg: nextCfg };
}

function buildProfileCredential(params: {
  provider: ManagedApiKeyProvider;
  key: string;
  label?: string;
  baseUrl?: string;
  existingType?: "api_key" | "token";
  previous?: ApiKeyCredential | TokenCredential | null;
}): ApiKeyCredential | TokenCredential {
  const metadata = {
    ...(params.previous?.type === "api_key" ? params.previous.metadata ?? {} : {}),
    ...(params.label ? { label: params.label } : {}),
    ...(params.baseUrl ? { baseUrl: params.baseUrl } : {}),
  };
  if (params.existingType === "token") {
    return {
      type: "token",
      provider: params.provider,
      token: params.key,
      ...(params.previous && "email" in params.previous && params.previous.email
        ? { email: params.previous.email }
        : {}),
    };
  }
  return {
    type: "api_key",
    provider: params.provider,
    key: params.key,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    ...(params.previous && "email" in params.previous && params.previous.email
      ? { email: params.previous.email }
      : {}),
  };
}

function upsertProfileConfig(params: {
  cfg: OpenClawConfig;
  profileId: string;
  provider: ManagedApiKeyProvider;
  mode: "api_key" | "token";
}): OpenClawConfig {
  return {
    ...params.cfg,
    auth: {
      ...(params.cfg.auth ?? {}),
      profiles: {
        ...(params.cfg.auth?.profiles ?? {}),
        [params.profileId]: {
          provider: params.provider,
          mode: providerModeForCredential(params.mode),
        },
      },
    },
  };
}

function removeProfileConfig(params: { cfg: OpenClawConfig; profileId: string }): OpenClawConfig {
  const nextProfiles = { ...(params.cfg.auth?.profiles ?? {}) };
  delete nextProfiles[params.profileId];
  const nextOrder = Object.fromEntries(
    Object.entries(params.cfg.auth?.order ?? {})
      .map(([provider, order]) => [
        provider,
        order.filter((profileId) => profileId !== params.profileId),
      ])
      .filter(([, order]) => order.length > 0),
  );
  return {
    ...params.cfg,
    auth:
      Object.keys(nextProfiles).length > 0 || Object.keys(nextOrder).length > 0
        ? {
            ...(params.cfg.auth ?? {}),
            ...(Object.keys(nextProfiles).length > 0 ? { profiles: nextProfiles } : {}),
            ...(Object.keys(nextOrder).length > 0 ? { order: nextOrder } : {}),
          }
        : params.cfg.auth,
  };
}

function removeProfileFromStore(params: {
  store: AuthProfileStore;
  profileId: string;
}): AuthProfileStore {
  const nextProfiles = { ...params.store.profiles };
  const removed = nextProfiles[params.profileId];
  delete nextProfiles[params.profileId];
  const nextOrder = Object.fromEntries(
    Object.entries(params.store.order ?? {})
      .map(([provider, order]) => [provider, order.filter((profileId) => profileId !== params.profileId)])
      .filter(([, order]) => order.length > 0),
  );
  const nextLastGood = Object.fromEntries(
    Object.entries(params.store.lastGood ?? {}).filter(([, profileId]) => profileId !== params.profileId),
  );
  const nextUsageStats = Object.fromEntries(
    Object.entries(params.store.usageStats ?? {}).filter(([profileId]) => profileId !== params.profileId),
  );
  return {
    ...params.store,
    profiles: nextProfiles,
    ...(Object.keys(nextOrder).length > 0 ? { order: nextOrder } : {}),
    ...(Object.keys(nextLastGood).length > 0 ? { lastGood: nextLastGood } : {}),
    ...(Object.keys(nextUsageStats).length > 0 ? { usageStats: nextUsageStats } : {}),
    ...(removed ? {} : {}),
  };
}

function persistStoreOrRollback(previous: AuthProfileStore, next: AuthProfileStore): void {
  saveAuthProfileStore(next);
  try {
    // Ensure the on-disk file exists in case later steps fail and we must restore it.
    void 0;
  } catch {
    saveAuthProfileStore(previous);
    throw new Error("Failed to persist auth profile store.");
  }
}

async function updateStoreWithSnapshot(params: {
  previous: AuthProfileStore;
  updater: (draft: AuthProfileStore) => void;
}): Promise<AuthProfileStore> {
  const updated = await updateAuthProfileStoreWithLock({
    updater: (store) => {
      params.updater(store);
      return true;
    },
  });
  if (!updated) {
    throw new Error("Failed to update auth profile store.");
  }
  return structuredClone(updated);
}

function resolveEntryByProfileId(store: AuthProfileStore, profileId: string): KeysListEntry | null {
  const cfg = loadConfig();
  return buildApiKeyEntries({ cfg, store }).find((entry) => entry.profileId === profileId) ?? null;
}

export function createApiKeysHandlers(params: {
  reloadSecretsRuntime: (params: { source: string }) => Promise<{
    warningCount: number;
    reloadedAt: number;
  }>;
}): GatewayRequestHandlers {
  return {
    "keys.list": async ({ params: requestParams, respond, context }) => {
      if (!assertValidParams(requestParams, validateKeysListParams, "keys.list", respond)) {
        return;
      }
      try {
        const cfg = loadConfig();
        const store = readFreshStore();
        const entries = buildApiKeyEntries({ cfg, store });
        respond(true, entries);
      } catch (error) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
      }
    },
    "keys.set": async ({ params: requestParams, respond, client, context }) => {
      if (!assertValidParams(requestParams, validateKeysSetParams, "keys.set", respond)) {
        return;
      }
      if (!requireLocalAuthenticatedWrite(client?.clientIp)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "keys.set is restricted to local connections."),
        );
        return;
      }

      const request = requestParams as KeysSetParams;
      try {
        const cfg = loadConfig();
        const catalog = await context.loadGatewayModelCatalog();
        const previousStore = readFreshStore();
        const provider = ensureManagedProvider(request.provider);
        const profileId = buildManagedProfileId({
          provider,
          label: trimOptional(request.label),
          existingProfileId: trimOptional(request.profileId),
          store: previousStore,
        });
        const previousCredential = previousStore.profiles[profileId];
        if (previousCredential && !isManagedApiKeyProvider(previousCredential.provider)) {
          throw new Error(`Profile "${profileId}" is not managed by the API key manager.`);
        }

        const incomingKey = trimOptional(request.key);
        const nextKey =
          incomingKey ??
          (previousCredential ? extractCredentialSecret(previousCredential as typeof previousCredential) : "");
        if (!nextKey) {
          throw new Error("API key is required.");
        }
        if (!validateProviderSecret(provider, nextKey)) {
          throw new Error(`Invalid ${provider} API key format.`);
        }

        const nextCredential = buildProfileCredential({
          provider,
          key: nextKey,
          label: trimOptional(request.label),
          baseUrl: trimOptional(request.baseUrl),
          existingType:
            previousCredential?.type === "token" ? "token" : "api_key",
          previous:
            previousCredential && (previousCredential.type === "api_key" || previousCredential.type === "token")
              ? previousCredential
              : null,
        });

        const nextStore = await updateStoreWithSnapshot({
          previous: previousStore,
          updater: (store) => {
            store.profiles[profileId] = nextCredential;
          },
        });

        let nextConfig = upsertProfileConfig({
          cfg,
          profileId,
          provider,
          mode: nextCredential.type === "token" ? "token" : "api_key",
        });
        const preferredModel = resolvePreferredModelForProvider({
          cfg: nextConfig,
          provider,
          catalog,
        });
        nextConfig = upsertProviderBaseUrlConfig({
          cfg: nextConfig,
          provider,
          baseUrl: trimOptional(request.baseUrl) ?? getCredentialBaseUrl(cfg, provider, previousCredential),
          catalog,
          preferredModelId: preferredModel,
        });
        if (preferredModel) {
          nextConfig = setConfiguredDefaultModel({
            cfg: nextConfig,
            modelId: preferredModel,
            fallbackProvider: provider,
          }).config;
        }
        const ordered = normalizeProfileOrder({
          store: nextStore,
          cfg: nextConfig,
          provider,
          selectedProfileId: profileId,
        });
        nextConfig = applyAuthProfileConfigOverlay(ordered.cfg, ordered.store);

        try {
          await writeConfigFile(nextConfig);
        } catch (error) {
          saveAuthProfileStore(previousStore);
          throw error;
        }

        const reload = await params.reloadSecretsRuntime({ source: "keys.set" });
        respond(true, {
          success: true,
          profileId,
          model: preferredModel,
          reloadedAt: reload.reloadedAt,
        });
      } catch (error) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
      }
    },
    "keys.delete": async ({ params: requestParams, respond, client }) => {
      if (!assertValidParams(requestParams, validateKeysDeleteParams, "keys.delete", respond)) {
        return;
      }
      if (!requireLocalAuthenticatedWrite(client?.clientIp)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "keys.delete is restricted to local connections."),
        );
        return;
      }

      const request = requestParams as KeysDeleteParams;
      try {
        const previousStore = readFreshStore();
        if (!previousStore.profiles[request.profileId]) {
          throw new Error(`Unknown profile "${request.profileId}".`);
        }
        const nextStore = await updateStoreWithSnapshot({
          previous: previousStore,
          updater: (store) => {
            const next = removeProfileFromStore({ store, profileId: request.profileId });
            store.profiles = next.profiles;
            store.order = next.order;
            store.lastGood = next.lastGood;
            store.usageStats = next.usageStats;
          },
        });

        const cfg = loadConfig();
        const nextConfig = applyAuthProfileConfigOverlay(
          removeProfileConfig({ cfg, profileId: request.profileId }),
          nextStore,
        );
        try {
          await writeConfigFile(nextConfig);
        } catch (error) {
          saveAuthProfileStore(previousStore);
          throw error;
        }
        const reload = await params.reloadSecretsRuntime({ source: "keys.delete" });
        respond(true, {
          success: true,
          reloadedAt: reload.reloadedAt,
        });
      } catch (error) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
      }
    },
    "keys.setActive": async ({ params: requestParams, respond, client, context }) => {
      if (!assertValidParams(requestParams, validateKeysSetActiveParams, "keys.setActive", respond)) {
        return;
      }
      if (!requireLocalAuthenticatedWrite(client?.clientIp)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "keys.setActive is restricted to local connections.",
          ),
        );
        return;
      }

      const request = requestParams as KeysSetActiveParams;
      try {
        const previousStore = readFreshStore();
        const credential = previousStore.profiles[request.profileId];
        if (!credential) {
          throw new Error(`Unknown profile "${request.profileId}".`);
        }
        const provider = ensureManagedProvider(credential.provider);
        const nextStore = await updateStoreWithSnapshot({
          previous: previousStore,
          updater: (store) => {
            const reordered = normalizeProfileOrder({
              store,
              cfg: loadConfig(),
              provider,
              selectedProfileId: request.profileId,
            }).store;
            store.order = reordered.order;
          },
        });
        const cfg = loadConfig();
        const catalog = await context.loadGatewayModelCatalog();
        const preferredModel = resolvePreferredModelForProvider({
          cfg,
          provider,
          catalog,
        });
        let nextConfig = applyAuthProfileConfigOverlay(cfg, nextStore);
        nextConfig = upsertProviderBaseUrlConfig({
          cfg: nextConfig,
          provider,
          baseUrl: getCredentialBaseUrl(cfg, provider, credential),
          catalog,
          preferredModelId: preferredModel,
        });
        if (preferredModel) {
          nextConfig = setConfiguredDefaultModel({
            cfg: nextConfig,
            modelId: preferredModel,
            fallbackProvider: provider,
          }).config;
        }
        try {
          await writeConfigFile(nextConfig);
        } catch (error) {
          saveAuthProfileStore(previousStore);
          throw error;
        }
        const reload = await params.reloadSecretsRuntime({ source: "keys.setActive" });
        respond(true, {
          success: true,
          model: preferredModel,
          reloadedAt: reload.reloadedAt,
        });
      } catch (error) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
      }
    },
    "keys.reload": async ({ params: requestParams, respond, client }) => {
      if (!assertValidParams(requestParams, validateKeysReloadParams, "keys.reload", respond)) {
        return;
      }
      if (!requireLocalAuthenticatedWrite(client?.clientIp)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "keys.reload is restricted to local connections."),
        );
        return;
      }
      try {
        const reload = await params.reloadSecretsRuntime({ source: "keys.reload" });
        respond(true, {
          success: true,
          reloadedAt: reload.reloadedAt,
        });
      } catch (error) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
      }
    },
    "model.setDefault": async ({ params: requestParams, respond, client, context }) => {
      if (!assertValidParams(requestParams, validateModelSetDefaultParams, "model.setDefault", respond)) {
        return;
      }
      if (!requireLocalAuthenticatedWrite(client?.clientIp)) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "model.setDefault is restricted to local connections.",
          ),
        );
        return;
      }

      const request = requestParams as ModelSetDefaultParams;
      try {
        const cfg = loadConfig();
        const next = setConfiguredDefaultModel({
          cfg,
          modelId: request.modelId,
        });
        const parsed = request.modelId.includes("/")
          ? request.modelId
          : next.current;
        const provider = normalizeManagedProvider(parsed.split("/", 1)[0] ?? "");
        let nextConfig = next.config;
        if (provider) {
          const catalog = await context.loadGatewayModelCatalog();
          nextConfig = upsertProviderBaseUrlConfig({
            cfg: nextConfig,
            provider,
            baseUrl:
              buildApiKeyEntries({ cfg, store: readFreshStore() }).find((entry) => entry.isActive && entry.provider === provider)
                ?.baseUrl ?? null,
            catalog,
            preferredModelId: next.current,
          });
        }
        await writeConfigFile(nextConfig);
        respond(true, {
          success: true,
          previous: next.previous,
          current: next.current,
        });
      } catch (error) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
      }
    },
  };
}
