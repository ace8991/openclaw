import {
  resolveAuthProfileDisplayLabel,
  resolveAuthProfileOrder,
  type AuthProfileCredential,
  type AuthProfileStore,
} from "../agents/auth-profiles.js";
import {
  findNormalizedProviderKey,
  modelKey,
  normalizeProviderId,
  normalizeProviderIdForAuth,
  parseModelRef,
  resolveDefaultModelForAgent,
} from "../agents/model-selection.js";
import type { ModelCatalogEntry } from "../agents/model-catalog.js";
import type {
  AgentModelEntryConfig,
  AuthConfig,
  ModelDefinitionConfig,
  ModelProviderConfig,
  ModelsConfig,
  OpenClawConfig,
} from "../config/config.js";

export const MANAGED_API_KEY_PROVIDERS = [
  "anthropic",
  "gemini",
  "groq",
  "lmstudio",
  "ollama",
  "openai",
  "openrouter",
] as const;

export type ManagedApiKeyProvider = (typeof MANAGED_API_KEY_PROVIDERS)[number];

const MANAGED_PROVIDER_SET = new Set<string>(MANAGED_API_KEY_PROVIDERS);

export const KEY_PATTERNS: Record<ManagedApiKeyProvider, RegExp> = {
  openai: /^sk-[a-zA-Z0-9\-_]{20,}$/,
  anthropic: /^sk-ant-[a-zA-Z0-9\-_]{20,}$/,
  gemini: /^AIza[a-zA-Z0-9\-_]{35}$/,
  openrouter: /^sk-or-[a-zA-Z0-9\-_]{20,}$/,
  groq: /^gsk_[a-zA-Z0-9]{52}$/,
  ollama: /.+/,
  lmstudio: /.+/,
};

export type ApiKeyEntry = {
  profileId: string;
  provider: ManagedApiKeyProvider;
  name: string;
  maskedKey: string;
  baseUrl: string | null;
  isActive: boolean;
  isValidFormat: boolean;
};

type ProviderFingerprint = {
  order: string[];
  profiles: Array<{
    id: string;
    type: string;
    provider: string;
    secret: string;
    label: string;
    baseUrl: string;
  }>;
};

const DEFAULT_CONTEXT_WINDOW = 32_768;
const DEFAULT_MAX_TOKENS = 8_192;

function normalizeManagedProviderCandidate(provider: string): string {
  return normalizeProviderIdForAuth(provider).trim().toLowerCase();
}

export function normalizeManagedProvider(provider: string): ManagedApiKeyProvider | null {
  const normalized = normalizeManagedProviderCandidate(provider);
  if (!MANAGED_PROVIDER_SET.has(normalized)) {
    return null;
  }
  return normalized as ManagedApiKeyProvider;
}

export function isManagedApiKeyProvider(provider: string): provider is ManagedApiKeyProvider {
  return normalizeManagedProvider(provider) !== null;
}

export function maskApiKeyValue(value: string | undefined): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "••••••••";
  }
  const head = trimmed.slice(0, Math.min(6, trimmed.length));
  const tail = trimmed.slice(-Math.min(4, trimmed.length));
  if (trimmed.length <= 10) {
    return `${head}••••`;
  }
  return `${head}••••••••${tail}`;
}

export function extractCredentialSecret(credential: AuthProfileCredential): string {
  switch (credential.type) {
    case "api_key":
      return credential.key?.trim() ?? "";
    case "token":
      return credential.token?.trim() ?? "";
    case "oauth":
      return credential.access?.trim() ?? "";
    default:
      return "";
  }
}

function readApiKeyMetadata(credential: AuthProfileCredential): Record<string, string> | undefined {
  if (credential.type !== "api_key" || !credential.metadata) {
    return undefined;
  }
  return credential.metadata;
}

export function getCredentialBaseUrl(
  cfg: OpenClawConfig,
  provider: string,
  credential?: AuthProfileCredential,
): string | null {
  const metadataBaseUrl = readApiKeyMetadata(credential ?? ({} as AuthProfileCredential))?.baseUrl;
  if (typeof metadataBaseUrl === "string" && metadataBaseUrl.trim()) {
    return metadataBaseUrl.trim();
  }
  const normalized = normalizeManagedProviderCandidate(provider);
  const providerKey = findNormalizedProviderKey(cfg.models?.providers, normalized);
  const baseUrl = providerKey ? cfg.models?.providers?.[providerKey]?.baseUrl : undefined;
  return typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : null;
}

function inferProfileName(params: {
  cfg: OpenClawConfig;
  store: AuthProfileStore;
  profileId: string;
  provider: ManagedApiKeyProvider;
  credential: AuthProfileCredential;
}): string {
  const metadataLabel = readApiKeyMetadata(params.credential)?.label?.trim();
  if (metadataLabel) {
    return metadataLabel;
  }
  const display = resolveAuthProfileDisplayLabel({
    cfg: params.cfg,
    store: params.store,
    profileId: params.profileId,
  }).trim();
  if (display && display !== params.profileId) {
    return display;
  }
  const [, suffixRaw] = params.profileId.split(":", 2);
  const suffix = suffixRaw?.trim();
  if (suffix && suffix !== "default") {
    return suffix
      .split(/[-_]+/g)
      .filter(Boolean)
      .map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
      .join(" ");
  }
  return params.provider[0]!.toUpperCase() + params.provider.slice(1);
}

export function validateProviderSecret(
  provider: ManagedApiKeyProvider,
  value: string | undefined,
): boolean {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return false;
  }
  return KEY_PATTERNS[provider].test(trimmed);
}

function buildProviderFingerprint(
  provider: ManagedApiKeyProvider,
  store: AuthProfileStore,
): ProviderFingerprint {
  const normalizedProvider = normalizeManagedProviderCandidate(provider);
  const order = (store.order?.[normalizedProvider] ?? []).map((entry) => entry.trim()).filter(Boolean);
  const profiles = Object.entries(store.profiles)
    .filter(([, credential]) => normalizeManagedProviderCandidate(credential.provider) === normalizedProvider)
    .map(([profileId, credential]) => {
      const metadata = readApiKeyMetadata(credential);
      return {
        id: profileId,
        type: credential.type,
        provider: normalizeManagedProviderCandidate(credential.provider),
        secret: extractCredentialSecret(credential),
        label: metadata?.label?.trim() ?? "",
        baseUrl: metadata?.baseUrl?.trim() ?? "",
      };
    })
    .toSorted((left, right) => left.id.localeCompare(right.id));
  return { order, profiles };
}

export function diffManagedProviderChanges(params: {
  previous: AuthProfileStore | null;
  next: AuthProfileStore;
}): ManagedApiKeyProvider[] {
  const changed: ManagedApiKeyProvider[] = [];
  for (const provider of MANAGED_API_KEY_PROVIDERS) {
    const previousFingerprint = params.previous
      ? JSON.stringify(buildProviderFingerprint(provider, params.previous))
      : "";
    const nextFingerprint = JSON.stringify(buildProviderFingerprint(provider, params.next));
    if (previousFingerprint !== nextFingerprint) {
      changed.push(provider);
    }
  }
  return changed;
}

export function buildApiKeyEntries(params: {
  cfg: OpenClawConfig;
  store: AuthProfileStore;
}): ApiKeyEntry[] {
  const activeProfileByProvider = new Map<ManagedApiKeyProvider, string>();
  for (const provider of MANAGED_API_KEY_PROVIDERS) {
    const order = resolveAuthProfileOrder({
      cfg: params.cfg,
      store: params.store,
      provider,
    });
    const activeProfileId = order[0]?.trim();
    if (activeProfileId) {
      activeProfileByProvider.set(provider, activeProfileId);
    }
  }

  return Object.entries(params.store.profiles)
    .flatMap(([profileId, credential]) => {
      const provider = normalizeManagedProvider(credential.provider);
      if (!provider) {
        return [];
      }
      const secret = extractCredentialSecret(credential);
      if (!secret) {
        return [];
      }
      return [
        {
          profileId,
          provider,
          name: inferProfileName({
            cfg: params.cfg,
            store: params.store,
            profileId,
            provider,
            credential,
          }),
          maskedKey: maskApiKeyValue(secret),
          baseUrl: getCredentialBaseUrl(params.cfg, provider, credential),
          isActive: activeProfileByProvider.get(provider) === profileId,
          isValidFormat: validateProviderSecret(provider, secret),
        } satisfies ApiKeyEntry,
      ];
    })
    .toSorted((left, right) => {
      if (left.isActive !== right.isActive) {
        return left.isActive ? -1 : 1;
      }
      const providerCompare = left.provider.localeCompare(right.provider);
      if (providerCompare !== 0) {
        return providerCompare;
      }
      return left.name.localeCompare(right.name);
    });
}

function normalizeAuthMode(type: AuthProfileCredential["type"]): "api_key" | "oauth" | "token" {
  return type === "api_key" ? "api_key" : type === "oauth" ? "oauth" : "token";
}

export function applyAuthProfileConfigOverlay(
  cfg: OpenClawConfig,
  store: AuthProfileStore,
): OpenClawConfig {
  const nextAuth: AuthConfig = {
    ...(cfg.auth ?? {}),
    profiles: { ...(cfg.auth?.profiles ?? {}) },
  };

  for (const [profileId, credential] of Object.entries(store.profiles)) {
    nextAuth.profiles![profileId] = {
      provider: normalizeProviderId(credential.provider),
      mode: normalizeAuthMode(credential.type),
      ...(nextAuth.profiles?.[profileId]?.email
        ? { email: nextAuth.profiles[profileId]!.email }
        : {}),
    };
  }

  if (store.order && Object.keys(store.order).length > 0) {
    nextAuth.order = {
      ...(cfg.auth?.order ?? {}),
      ...Object.fromEntries(
        Object.entries(store.order)
          .map(([provider, order]) => [
            normalizeManagedProviderCandidate(provider),
            order.map((entry) => entry.trim()).filter(Boolean),
          ])
          .filter(([, order]) => order.length > 0),
      ),
    };
  }

  return {
    ...cfg,
    auth: nextAuth,
  };
}

function normalizeModelInputTypes(input: ModelCatalogEntry["input"]): Array<"text" | "image"> {
  const normalized = (input ?? []).filter(
    (entry): entry is "text" | "image" => entry === "text" || entry === "image",
  );
  return normalized.length > 0 ? normalized : ["text"];
}

function buildModelDefinitionFromId(id: string, name?: string): ModelDefinitionConfig {
  return {
    id,
    name: name?.trim() || id,
    api: undefined,
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
  };
}

function buildModelDefinitionFromCatalog(entry: ModelCatalogEntry): ModelDefinitionConfig {
  const contextWindow =
    typeof entry.contextWindow === "number" && entry.contextWindow > 0
      ? entry.contextWindow
      : DEFAULT_CONTEXT_WINDOW;
  return {
    id: entry.id,
    name: entry.name?.trim() || entry.id,
    reasoning: entry.reasoning === true,
    input: normalizeModelInputTypes(entry.input),
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow,
    maxTokens: Math.max(1024, Math.min(DEFAULT_MAX_TOKENS, contextWindow)),
  };
}

function buildProviderModelDefinitions(params: {
  provider: ManagedApiKeyProvider;
  cfg: OpenClawConfig;
  catalog: ModelCatalogEntry[];
  preferredModelId?: string | null;
}): ModelDefinitionConfig[] {
  const normalizedProvider = normalizeManagedProviderCandidate(params.provider);
  const catalogModels = params.catalog
    .filter((entry) => normalizeManagedProviderCandidate(entry.provider) === normalizedProvider)
    .map((entry) => buildModelDefinitionFromCatalog(entry));
  if (catalogModels.length > 0) {
    return catalogModels;
  }

  const configuredRefs = Object.keys(params.cfg.agents?.defaults?.models ?? {})
    .map((raw) => parseModelRef(raw, normalizedProvider))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .filter((entry) => normalizeManagedProviderCandidate(entry.provider) === normalizedProvider)
    .map((entry) => entry.model);

  const preferredId = (() => {
    const raw = params.preferredModelId?.trim() ?? "";
    if (!raw) {
      return "";
    }
    const parsed = parseModelRef(raw, normalizedProvider);
    if (!parsed || normalizeManagedProviderCandidate(parsed.provider) !== normalizedProvider) {
      return "";
    }
    return parsed.model;
  })();

  const candidateIds = Array.from(
    new Set([preferredId, ...configuredRefs].map((entry) => entry.trim()).filter(Boolean)),
  );
  if (candidateIds.length > 0) {
    return candidateIds.map((id) => buildModelDefinitionFromId(id));
  }

  return [buildModelDefinitionFromId("default-model", "Default Model")];
}

export function upsertProviderBaseUrlConfig(params: {
  cfg: OpenClawConfig;
  provider: ManagedApiKeyProvider;
  baseUrl?: string | null;
  catalog: ModelCatalogEntry[];
  preferredModelId?: string | null;
}): OpenClawConfig {
  const baseUrl = params.baseUrl?.trim();
  if (!baseUrl) {
    return params.cfg;
  }

  const providers = { ...(params.cfg.models?.providers ?? {}) };
  const normalizedProvider = normalizeManagedProviderCandidate(params.provider);
  const providerKey = findNormalizedProviderKey(providers, normalizedProvider) ?? normalizedProvider;
  const current = providers[providerKey];
  const nextProvider: ModelProviderConfig = current
    ? {
        ...current,
        baseUrl,
        api:
          normalizedProvider === "ollama"
            ? "ollama"
            : current.api ?? "openai-completions",
        models:
          Array.isArray(current.models) && current.models.length > 0
            ? current.models
            : buildProviderModelDefinitions({
                provider: params.provider,
                cfg: params.cfg,
                catalog: params.catalog,
                preferredModelId: params.preferredModelId,
              }),
      }
    : {
        baseUrl,
        api: normalizedProvider === "ollama" ? "ollama" : "openai-completions",
        models: buildProviderModelDefinitions({
          provider: params.provider,
          cfg: params.cfg,
          catalog: params.catalog,
          preferredModelId: params.preferredModelId,
        }),
      };

  providers[providerKey] = nextProvider;
  const nextModels: ModelsConfig = {
    ...(params.cfg.models ?? {}),
    providers,
  };

  return {
    ...params.cfg,
    models: nextModels,
  };
}

export function resolvePreferredModelForProvider(params: {
  cfg: OpenClawConfig;
  provider: ManagedApiKeyProvider;
  catalog: ModelCatalogEntry[];
}): string | null {
  const runtimeDefault = resolveDefaultModelForAgent({ cfg: params.cfg });
  if (normalizeManagedProviderCandidate(runtimeDefault.provider) === params.provider) {
    return modelKey(runtimeDefault.provider, runtimeDefault.model);
  }

  const configuredModelKey = Object.keys(params.cfg.agents?.defaults?.models ?? {}).find((raw) => {
    const parsed = parseModelRef(raw, params.provider);
    return parsed && normalizeManagedProviderCandidate(parsed.provider) === params.provider;
  });
  if (configuredModelKey) {
    const parsed = parseModelRef(configuredModelKey, params.provider);
    if (parsed) {
      return modelKey(parsed.provider, parsed.model);
    }
  }

  const catalogMatch = params.catalog.find(
    (entry) => normalizeManagedProviderCandidate(entry.provider) === params.provider,
  );
  if (catalogMatch) {
    return modelKey(catalogMatch.provider, catalogMatch.id);
  }

  const providerKey = findNormalizedProviderKey(params.cfg.models?.providers, params.provider);
  const configuredProvider = providerKey ? params.cfg.models?.providers?.[providerKey] : undefined;
  const configuredProviderModel = configuredProvider?.models?.[0]?.id?.trim();
  if (configuredProviderModel) {
    return modelKey(params.provider, configuredProviderModel);
  }

  return null;
}

export function setConfiguredDefaultModel(params: {
  cfg: OpenClawConfig;
  modelId: string;
  fallbackProvider?: string;
}): { config: OpenClawConfig; previous: string | null; current: string } {
  const previousRef = resolveDefaultModelForAgent({ cfg: params.cfg });
  const previous = modelKey(previousRef.provider, previousRef.model);
  const parsed = parseModelRef(params.modelId, params.fallbackProvider ?? previousRef.provider);
  if (!parsed) {
    throw new Error(`Invalid model id "${params.modelId}".`);
  }

  const current = modelKey(parsed.provider, parsed.model);
  const nextModels: Record<string, AgentModelEntryConfig> = {
    ...(params.cfg.agents?.defaults?.models ?? {}),
  };
  nextModels[current] = nextModels[current] ?? {};

  return {
    previous,
    current,
    config: {
      ...params.cfg,
      agents: {
        ...(params.cfg.agents ?? {}),
        defaults: {
          ...(params.cfg.agents?.defaults ?? {}),
          model: {
            ...(typeof params.cfg.agents?.defaults?.model === "object" &&
            params.cfg.agents?.defaults?.model !== null
              ? params.cfg.agents.defaults.model
              : {}),
            primary: current,
          },
          models: nextModels,
        },
      },
    },
  };
}

export function buildManagedProfileId(params: {
  provider: ManagedApiKeyProvider;
  label?: string | null;
  existingProfileId?: string | null;
  store: AuthProfileStore;
}): string {
  const existing = params.existingProfileId?.trim();
  if (existing) {
    return existing;
  }

  const slugSource = params.label?.trim() ?? "";
  const slug = slugSource
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = `${params.provider}:${slug || "default"}`;
  if (!params.store.profiles[base]) {
    return base;
  }
  let index = 2;
  while (params.store.profiles[`${base}-${index}`]) {
    index += 1;
  }
  return `${base}-${index}`;
}
