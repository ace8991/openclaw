import type { GatewayBrowserClient } from "../gateway.ts";
import type { ModelCatalogEntry, SessionsListResult } from "../types.ts";

export type ApiKeyListEntry = {
  profileId: string;
  provider: string;
  name: string;
  maskedKey: string;
  baseUrl: string | null;
  isActive: boolean;
  isValidFormat: boolean;
};

export type ApiKeysToast = {
  kind: "success" | "error" | "warning";
  message: string;
};

export type ApiKeyFormState = {
  profileId: string | null;
  provider: string;
  label: string;
  key: string;
  baseUrl: string;
};

export type ApiKeysState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  apiKeysLoading: boolean;
  apiKeysSaving: boolean;
  apiKeysError: string | null;
  apiKeysEntries: ApiKeyListEntry[];
  apiKeysModelCatalog: ModelCatalogEntry[];
  apiKeysDefaultModel: string;
  apiKeysActiveProvider: string;
  apiKeysLastReloadAt: number | null;
  apiKeysReveal: Record<string, boolean>;
  apiKeysFormOpen: boolean;
  apiKeysForm: ApiKeyFormState;
  apiKeysFormError: string | null;
  apiKeysToast: ApiKeysToast | null;
  apiKeysInvalidCount: number;
  apiKeysToastTimer?: number | null;
};

const TOAST_MS = 3000;

const PROVIDER_PATTERNS: Record<string, RegExp> = {
  openai: /^sk-[a-zA-Z0-9\-_]{20,}$/,
  anthropic: /^sk-ant-[a-zA-Z0-9\-_]{20,}$/,
  gemini: /^AIza[a-zA-Z0-9\-_]{35}$/,
  openrouter: /^sk-or-[a-zA-Z0-9\-_]{20,}$/,
  groq: /^gsk_[a-zA-Z0-9]{52}$/,
  ollama: /.+/,
  lmstudio: /.+/,
};

function emptyForm(provider = "lmstudio"): ApiKeyFormState {
  return {
    profileId: null,
    provider,
    label: "",
    key: "",
    baseUrl: "",
  };
}

function parseDefaultModel(result: SessionsListResult | undefined): string {
  const provider = result?.defaults?.modelProvider?.trim() ?? "";
  const model = result?.defaults?.model?.trim() ?? "";
  return provider && model ? `${provider}/${model}` : "";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setToast(state: ApiKeysState, toast: ApiKeysToast | null) {
  state.apiKeysToast = toast;
  if (state.apiKeysToastTimer) {
    window.clearTimeout(state.apiKeysToastTimer);
    state.apiKeysToastTimer = null;
  }
  if (!toast) {
    return;
  }
  state.apiKeysToastTimer = window.setTimeout(() => {
    state.apiKeysToast = null;
    state.apiKeysToastTimer = null;
  }, TOAST_MS);
}

function inferActiveProvider(state: ApiKeysState): string {
  const fromDefault = state.apiKeysDefaultModel.split("/", 1)[0]?.trim();
  if (fromDefault) {
    return fromDefault;
  }
  const fromActiveEntry = state.apiKeysEntries.find((entry) => entry.isActive)?.provider?.trim();
  if (fromActiveEntry) {
    return fromActiveEntry;
  }
  return state.apiKeysActiveProvider || "lmstudio";
}

function validateClientKey(provider: string, key: string): string | null {
  const trimmedProvider = provider.trim().toLowerCase();
  const pattern = PROVIDER_PATTERNS[trimmedProvider];
  if (!pattern) {
    return `Unsupported provider "${provider}".`;
  }
  if (!pattern.test(key.trim())) {
    return `Invalid ${trimmedProvider} API key format.`;
  }
  return null;
}

export async function loadApiKeys(state: ApiKeysState) {
  if (!state.client || !state.connected || state.apiKeysLoading) {
    return;
  }
  state.apiKeysLoading = true;
  state.apiKeysError = null;
  try {
    const [entries, modelsResult, sessionsResult] = await Promise.all([
      state.client.request<ApiKeyListEntry[]>("keys.list", {}),
      state.client.request<{ models?: ModelCatalogEntry[] }>("models.list", {}),
      state.client.request<SessionsListResult>("sessions.list", {
        includeGlobal: true,
        includeUnknown: true,
        limit: 1,
      }),
    ]);
    state.apiKeysEntries = Array.isArray(entries) ? entries : [];
    state.apiKeysModelCatalog = modelsResult?.models ?? [];
    state.apiKeysDefaultModel = parseDefaultModel(sessionsResult);
    state.apiKeysActiveProvider = inferActiveProvider(state);
    state.apiKeysInvalidCount = state.apiKeysEntries.filter((entry) => !entry.isValidFormat).length;
  } catch (error) {
    state.apiKeysError = getErrorMessage(error);
  } finally {
    state.apiKeysLoading = false;
  }
}

export function openApiKeyForm(
  state: ApiKeysState,
  options?: { provider?: string; entry?: ApiKeyListEntry | null },
) {
  const provider = options?.provider ?? options?.entry?.provider ?? inferActiveProvider(state);
  const entry = options?.entry ?? null;
  state.apiKeysFormOpen = true;
  state.apiKeysFormError = null;
  state.apiKeysForm = entry
    ? {
        profileId: entry.profileId,
        provider: entry.provider,
        label: entry.name,
        key: "",
        baseUrl: entry.baseUrl ?? "",
      }
    : emptyForm(provider);
}

export function closeApiKeyForm(state: ApiKeysState) {
  state.apiKeysFormOpen = false;
  state.apiKeysFormError = null;
  state.apiKeysForm = emptyForm(inferActiveProvider(state));
}

export function updateApiKeyForm(state: ApiKeysState, patch: Partial<ApiKeyFormState>) {
  state.apiKeysForm = {
    ...state.apiKeysForm,
    ...patch,
  };
}

export function toggleApiKeyMask(state: ApiKeysState, profileId: string) {
  state.apiKeysReveal = {
    ...state.apiKeysReveal,
    [profileId]: !state.apiKeysReveal[profileId],
  };
}

export async function saveApiKey(state: ApiKeysState) {
  if (!state.client || !state.connected || state.apiKeysSaving) {
    return;
  }
  const form = state.apiKeysForm;
  const provider = form.provider.trim().toLowerCase();
  const key = form.key.trim();
  state.apiKeysFormError = null;
  if (!provider) {
    state.apiKeysFormError = "Provider is required.";
    return;
  }
  if (!form.profileId && !key) {
    state.apiKeysFormError = "API key is required.";
    return;
  }
  if (key) {
    const validationError = validateClientKey(provider, key);
    if (validationError) {
      state.apiKeysFormError = validationError;
      return;
    }
  }

  state.apiKeysSaving = true;
  try {
    const result = await state.client.request<{
      success: boolean;
      profileId: string;
      model?: string;
      reloadedAt?: number;
    }>("keys.set", {
      provider,
      key: key || undefined,
      baseUrl: form.baseUrl.trim() || undefined,
      label: form.label.trim() || undefined,
      profileId: form.profileId ?? undefined,
    });
    state.apiKeysLastReloadAt =
      typeof result?.reloadedAt === "number" ? result.reloadedAt : Date.now();
    if (typeof result?.model === "string" && result.model.trim()) {
      state.apiKeysDefaultModel = result.model.trim();
      state.apiKeysActiveProvider = result.model.split("/", 1)[0] ?? provider;
    } else {
      state.apiKeysActiveProvider = provider;
    }
    setToast(state, {
      kind: "success",
      message: "Key saved — gateway reloaded!",
    });
    await loadApiKeys(state);
    closeApiKeyForm(state);
  } catch (error) {
    const message = getErrorMessage(error);
    state.apiKeysFormError = message;
    setToast(state, { kind: "error", message });
  } finally {
    state.apiKeysSaving = false;
  }
}

export async function deleteApiKey(state: ApiKeysState, profileId: string) {
  if (!state.client || !state.connected || state.apiKeysSaving) {
    return;
  }
  const confirmed = window.confirm("Delete this API key profile?");
  if (!confirmed) {
    return;
  }
  const previousEntries = [...state.apiKeysEntries];
  state.apiKeysEntries = state.apiKeysEntries.filter((entry) => entry.profileId !== profileId);
  state.apiKeysSaving = true;
  try {
    const result = await state.client.request<{ success: boolean; reloadedAt?: number }>(
      "keys.delete",
      { profileId },
    );
    state.apiKeysLastReloadAt =
      typeof result?.reloadedAt === "number" ? result.reloadedAt : Date.now();
    setToast(state, { kind: "success", message: "Key deleted." });
    await loadApiKeys(state);
  } catch (error) {
    state.apiKeysEntries = previousEntries;
    const message = getErrorMessage(error);
    state.apiKeysError = message;
    setToast(state, { kind: "error", message });
  } finally {
    state.apiKeysSaving = false;
  }
}

export async function setActiveApiKey(state: ApiKeysState, profileId: string) {
  if (!state.client || !state.connected || state.apiKeysSaving) {
    return;
  }
  const previousEntries = state.apiKeysEntries.map((entry) => ({ ...entry }));
  const target = state.apiKeysEntries.find((entry) => entry.profileId === profileId);
  if (!target) {
    return;
  }
  state.apiKeysEntries = state.apiKeysEntries.map((entry) => ({
    ...entry,
    isActive: entry.profileId === profileId,
  }));
  state.apiKeysActiveProvider = target.provider;
  state.apiKeysSaving = true;
  try {
    const result = await state.client.request<{
      success: boolean;
      model?: string;
      reloadedAt?: number;
    }>("keys.setActive", { profileId });
    if (typeof result?.model === "string" && result.model.trim()) {
      state.apiKeysDefaultModel = result.model.trim();
      state.apiKeysActiveProvider = result.model.split("/", 1)[0] ?? target.provider;
    }
    state.apiKeysLastReloadAt =
      typeof result?.reloadedAt === "number" ? result.reloadedAt : Date.now();
    setToast(state, { kind: "success", message: "Active provider updated." });
    await loadApiKeys(state);
  } catch (error) {
    state.apiKeysEntries = previousEntries;
    state.apiKeysActiveProvider = inferActiveProvider(state);
    const message = getErrorMessage(error);
    state.apiKeysError = message;
    setToast(state, { kind: "error", message });
  } finally {
    state.apiKeysSaving = false;
  }
}

export async function setDefaultModel(state: ApiKeysState, modelId: string) {
  if (!state.client || !state.connected || state.apiKeysSaving) {
    return;
  }
  const previousModel = state.apiKeysDefaultModel;
  state.apiKeysDefaultModel = modelId;
  state.apiKeysSaving = true;
  try {
    const result = await state.client.request<{ success: boolean; current?: string }>(
      "model.setDefault",
      { modelId },
    );
    state.apiKeysDefaultModel = result?.current?.trim() || modelId;
    state.apiKeysActiveProvider = state.apiKeysDefaultModel.split("/", 1)[0] ?? inferActiveProvider(state);
    setToast(state, { kind: "success", message: "Default model updated." });
    await loadApiKeys(state);
  } catch (error) {
    state.apiKeysDefaultModel = previousModel;
    const message = getErrorMessage(error);
    state.apiKeysError = message;
    setToast(state, { kind: "error", message });
  } finally {
    state.apiKeysSaving = false;
  }
}

export async function reloadApiKeys(state: ApiKeysState) {
  if (!state.client || !state.connected || state.apiKeysSaving) {
    return;
  }
  state.apiKeysSaving = true;
  try {
    const result = await state.client.request<{ success: boolean; reloadedAt?: number }>(
      "keys.reload",
      {},
    );
    state.apiKeysLastReloadAt =
      typeof result?.reloadedAt === "number" ? result.reloadedAt : Date.now();
    setToast(state, { kind: "success", message: "Secrets reloaded." });
    await loadApiKeys(state);
  } catch (error) {
    const message = getErrorMessage(error);
    state.apiKeysError = message;
    setToast(state, { kind: "error", message });
  } finally {
    state.apiKeysSaving = false;
  }
}

export function handleSecretsReloadedEvent(
  state: ApiKeysState,
  payload: { reloadedAt?: unknown } | undefined,
) {
  if (typeof payload?.reloadedAt === "number") {
    state.apiKeysLastReloadAt = payload.reloadedAt;
  } else {
    state.apiKeysLastReloadAt = Date.now();
  }
}
