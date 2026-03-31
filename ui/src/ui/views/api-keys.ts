import { html, nothing } from "lit";
import { icons } from "../icons.ts";
import type {
  ApiKeyFormState,
  ApiKeyListEntry,
  ApiKeysToast,
} from "../controllers/api-keys.ts";
import type { ModelCatalogEntry } from "../types.ts";

type ProviderDefinition = {
  id: string;
  label: string;
  description: string;
  icon: keyof typeof icons;
  baseUrlPlaceholder?: string;
};

export type ApiKeysViewProps = {
  connected: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  entries: ApiKeyListEntry[];
  modelCatalog: ModelCatalogEntry[];
  defaultModel: string;
  activeProvider: string;
  lastReloadAt: number | null;
  reveal: Record<string, boolean>;
  formOpen: boolean;
  form: ApiKeyFormState;
  formError: string | null;
  toast: ApiKeysToast | null;
  invalidCount: number;
  onReload: () => void;
  onOpenAdd: (provider?: string) => void;
  onOpenEdit: (entry: ApiKeyListEntry) => void;
  onCloseForm: () => void;
  onFormPatch: (patch: Partial<ApiKeyFormState>) => void;
  onSave: () => void;
  onDelete: (profileId: string) => void;
  onSetActive: (profileId: string) => void;
  onToggleMask: (profileId: string) => void;
  onSetDefaultModel: (modelId: string) => void;
};

const PROVIDERS: ProviderDefinition[] = [
  {
    id: "lmstudio",
    label: "LM Studio",
    description: "Local OpenAI-compatible endpoint.",
    icon: "monitor",
    baseUrlPlaceholder: "http://127.0.0.1:1234/v1",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Hosted OpenAI models and responses.",
    icon: "spark",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude models via API key.",
    icon: "brain",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Multi-provider routing with one key.",
    icon: "link",
  },
  {
    id: "gemini",
    label: "Gemini",
    description: "Google Gemini API access.",
    icon: "globe",
  },
  {
    id: "groq",
    label: "Groq",
    description: "Fast hosted inference endpoints.",
    icon: "radio",
  },
  {
    id: "ollama",
    label: "Ollama",
    description: "Local Ollama runtime and models.",
    icon: "terminal",
    baseUrlPlaceholder: "http://127.0.0.1:11434",
  },
];

function formatReloadTime(value: number | null): string {
  if (!value) {
    return "Waiting for first reload";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function normalizeProvider(value: string): string {
  return value.trim().toLowerCase();
}

function labelForProvider(providerId: string): string {
  return PROVIDERS.find((provider) => provider.id === providerId)?.label ?? providerId;
}

function activeEntryForProvider(entries: ApiKeyListEntry[], providerId: string): ApiKeyListEntry | null {
  return (
    entries.find(
      (entry) => normalizeProvider(entry.provider) === providerId && entry.isActive,
    ) ??
    entries.find((entry) => normalizeProvider(entry.provider) === providerId) ??
    null
  );
}

function modelOptionsForProvider(
  models: ModelCatalogEntry[],
  providerId: string,
  defaultModel: string,
): Array<{ value: string; label: string }> {
  const normalizedProvider = normalizeProvider(providerId);
  const seen = new Set<string>();
  const options: Array<{ value: string; label: string }> = [];
  const addOption = (value: string, label?: string) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) {
      return;
    }
    seen.add(trimmed.toLowerCase());
    options.push({ value: trimmed, label: label ?? trimmed });
  };

  for (const model of models) {
    if (normalizeProvider(model.provider) !== normalizedProvider) {
      continue;
    }
    const value = `${model.provider}/${model.id}`;
    addOption(value, model.name || model.id);
  }

  if (defaultModel) {
    const [provider, modelId] = defaultModel.split("/", 2);
    if (normalizeProvider(provider ?? "") === normalizedProvider) {
      addOption(defaultModel, modelId || defaultModel);
    }
  }

  return options.sort((left, right) => left.label.localeCompare(right.label));
}

function hiddenMaskedValue(maskedKey: string): string {
  return "*".repeat(Math.max(12, maskedKey.length));
}

function renderProviderCard(
  provider: ProviderDefinition,
  props: ApiKeysViewProps,
  selectedProvider: string,
) {
  const entries = props.entries.filter(
    (entry) => normalizeProvider(entry.provider) === provider.id,
  );
  const activeEntry = activeEntryForProvider(props.entries, provider.id);
  const invalidCount = entries.filter((entry) => !entry.isValidFormat).length;
  const isSelected = selectedProvider === provider.id;
  const actionLabel = activeEntry ? "Set active" : "Add key";

  return html`
    <button
      type="button"
      class="api-keys-provider-card ${isSelected ? "api-keys-provider-card--active" : ""} ${invalidCount > 0 ? "api-keys-provider-card--invalid" : ""}"
      ?disabled=${!props.connected || props.saving}
      @click=${() => {
        if (activeEntry) {
          props.onSetActive(activeEntry.profileId);
          return;
        }
        props.onOpenAdd(provider.id);
      }}
      title=${activeEntry ? `${provider.label}: set active provider` : `${provider.label}: add API key`}
    >
      <div class="api-keys-provider-card__header">
        <span class="api-keys-provider-card__icon" aria-hidden="true">${icons[provider.icon]}</span>
        <div class="api-keys-provider-card__titles">
          <div class="api-keys-provider-card__title">${provider.label}</div>
          <div class="api-keys-provider-card__description">${provider.description}</div>
        </div>
      </div>
      <div class="api-keys-provider-card__meta">
        <span class="pill">
          <span
            class="api-keys-status-dot ${isSelected && activeEntry ? "api-keys-status-dot--active" : ""}"
          ></span>
          ${isSelected && activeEntry ? "ACTIVE" : actionLabel}
        </span>
        <span class="pill">${entries.length} key${entries.length === 1 ? "" : "s"}</span>
        ${invalidCount > 0 ? html`<span class="pill danger">${invalidCount} invalid</span>` : nothing}
      </div>
    </button>
  `;
}

function renderKeyRow(entry: ApiKeyListEntry, props: ApiKeysViewProps) {
  const providerLabel = labelForProvider(normalizeProvider(entry.provider));
  const showMasked = Boolean(props.reveal[entry.profileId]);
  const displayValue = showMasked ? entry.maskedKey : hiddenMaskedValue(entry.maskedKey);

  return html`
    <div class="api-keys-row">
      <div class="api-keys-row__main">
        <div class="api-keys-row__header">
          <div class="api-keys-row__title">
            <span class="api-keys-row__provider">${providerLabel}</span>
            <span>${entry.name || providerLabel}</span>
          </div>
          <div class="api-keys-row__badges">
            ${entry.isActive ? html`<span class="pill">Active</span>` : nothing}
            ${!entry.isValidFormat ? html`<span class="pill danger">Invalid format</span>` : nothing}
          </div>
        </div>
        <div class="api-keys-row__secret mono">${displayValue}</div>
        ${
          entry.baseUrl
            ? html`<div class="api-keys-row__endpoint">
                <span class="label">Base URL</span>
                <span class="mono">${entry.baseUrl}</span>
              </div>`
            : nothing
        }
      </div>
      <div class="api-keys-row__actions">
        <button
          type="button"
          class="btn btn--sm"
          ?disabled=${!props.connected || props.saving}
          @click=${() => props.onToggleMask(entry.profileId)}
        >
          ${showMasked ? icons.eyeOff : icons.eye}
          ${showMasked ? "Hide" : "Show"}
        </button>
        <button
          type="button"
          class="btn btn--sm"
          ?disabled=${!props.connected || props.saving}
          @click=${() => props.onOpenEdit(entry)}
        >
          ${icons.edit}
          Edit
        </button>
        <button
          type="button"
          class="btn btn--sm danger"
          ?disabled=${!props.connected || props.saving}
          @click=${() => props.onDelete(entry.profileId)}
        >
          ${icons.trash}
          Delete
        </button>
      </div>
    </div>
  `;
}

function renderAddKeyForm(props: ApiKeysViewProps) {
  const provider = PROVIDERS.find(
    (entry) => entry.id === normalizeProvider(props.form.provider),
  );
  const formTitle = props.form.profileId ? "Edit API key" : "Add API key";

  return html`
    <form
      class="api-keys-form"
      @submit=${(event: Event) => {
        event.preventDefault();
        props.onSave();
      }}
    >
      <div class="row" style="justify-content: space-between; align-items: center; gap: 12px;">
        <div>
          <div class="card-title">${formTitle}</div>
          <div class="card-sub">Save changes and hot-reload the gateway immediately.</div>
        </div>
        <button type="button" class="btn btn--sm" @click=${props.onCloseForm}>Close</button>
      </div>
      <div class="api-keys-form__grid">
        <label class="field">
          <span>Provider</span>
          <select
            .value=${props.form.provider}
            @change=${(event: Event) =>
              props.onFormPatch({
                provider: (event.target as HTMLSelectElement).value,
              })}
          >
            ${PROVIDERS.map(
              (entry) => html`<option value=${entry.id}>${entry.label}</option>`,
            )}
          </select>
        </label>
        <label class="field">
          <span>Label</span>
          <input
            .value=${props.form.label}
            @input=${(event: Event) =>
              props.onFormPatch({
                label: (event.target as HTMLInputElement).value,
              })}
            placeholder="Personal OpenAI key"
          />
        </label>
        <label class="field full">
          <span>API key</span>
          <input
            type="password"
            .value=${props.form.key}
            @input=${(event: Event) =>
              props.onFormPatch({
                key: (event.target as HTMLInputElement).value,
              })}
            placeholder=${props.form.profileId ? "Leave blank to keep the current secret" : "Paste provider API key"}
          />
        </label>
        <label class="field full">
          <span>Base URL</span>
          <input
            .value=${props.form.baseUrl}
            @input=${(event: Event) =>
              props.onFormPatch({
                baseUrl: (event.target as HTMLInputElement).value,
              })}
            placeholder=${provider?.baseUrlPlaceholder ?? "Optional custom base URL"}
          />
        </label>
      </div>
      ${
        props.formError
          ? html`<div class="callout danger api-keys-form__error">${props.formError}</div>`
          : nothing
      }
      <div class="api-keys-form__actions">
        <button type="submit" class="btn primary" ?disabled=${!props.connected || props.saving}>
          ${icons.check}
          ${props.saving ? "Saving..." : "Save & Hot-Reload"}
        </button>
        <button type="button" class="btn" ?disabled=${props.saving} @click=${props.onCloseForm}>
          Cancel
        </button>
      </div>
    </form>
  `;
}

function renderModelSelector(props: ApiKeysViewProps, selectedProvider: string) {
  const options = modelOptionsForProvider(props.modelCatalog, selectedProvider, props.defaultModel);
  const selectedValue =
    options.find((option) => option.value === props.defaultModel)?.value ??
    options[0]?.value ??
    "";

  return html`
    <section class="card api-keys-section">
      <div class="row" style="justify-content: space-between; align-items: center; gap: 12px;">
        <div>
          <div class="card-title">Default model</div>
          <div class="card-sub">Apply a different model for the active provider without restarting.</div>
        </div>
        <span class="pill">
          <span class="api-keys-status-dot api-keys-status-dot--active"></span>
          ${props.defaultModel || "No default model"}
        </span>
      </div>
      ${
        options.length === 0
          ? html`<div class="callout info" style="margin-top: 14px;">
              No catalog models are currently available for ${labelForProvider(selectedProvider)}.
            </div>`
          : html`
              <form
                class="api-keys-model-form"
                @submit=${(event: Event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget as HTMLFormElement);
                  const nextModel = String(formData.get("default-model") ?? "").trim();
                  if (nextModel) {
                    props.onSetDefaultModel(nextModel);
                  }
                }}
              >
                <label class="field" style="min-width: 0;">
                  <span>Model for ${labelForProvider(selectedProvider)}</span>
                  <select name="default-model" .value=${selectedValue}>
                    ${options.map(
                      (option) => html`<option value=${option.value}>${option.label}</option>`,
                    )}
                  </select>
                </label>
                <button
                  type="submit"
                  class="btn primary"
                  ?disabled=${!props.connected || props.saving}
                >
                  Apply
                </button>
              </form>
            `
      }
    </section>
  `;
}

export function renderApiKeys(props: ApiKeysViewProps) {
  const selectedProvider = normalizeProvider(
    props.activeProvider || props.defaultModel.split("/", 1)[0] || "lmstudio",
  );

  return html`
    <section class="api-keys-view">
      <section class="card api-keys-section">
        <div class="api-keys-status-bar">
          <div class="api-keys-status-bar__copy">
            <span class="pill ${props.connected ? "" : "danger"}">
              <span
                class="api-keys-status-dot ${props.connected ? "api-keys-status-dot--active" : "api-keys-status-dot--offline"}"
              ></span>
              ${props.connected ? "GATEWAY LIVE" : "DISCONNECTED"}
            </span>
            <div>
              <div class="card-title">Hot-reload API key manager</div>
              <div class="card-sub">
                Hot-reload active — changes apply instantly.
                <span class="mono">Last reload: ${formatReloadTime(props.lastReloadAt)}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            class="btn"
            ?disabled=${!props.connected || props.saving}
            @click=${props.onReload}
          >
            ${icons.refresh}
            ${props.loading ? "Refreshing..." : "Reload now"}
          </button>
        </div>
        ${
          props.invalidCount > 0
            ? html`<div class="callout danger" style="margin-top: 14px;">
                ${props.invalidCount} configured key${props.invalidCount === 1 ? "" : "s"} failed
                client-side format checks. Update them before switching providers.
              </div>`
            : nothing
        }
        ${
          props.error
            ? html`<div class="callout danger" style="margin-top: 14px;">${props.error}</div>`
            : nothing
        }
      </section>

      <section class="card api-keys-section">
        <div class="row" style="justify-content: space-between; align-items: center; gap: 12px;">
          <div>
            <div class="card-title">Providers</div>
            <div class="card-sub">Activate a configured provider or start a new profile.</div>
          </div>
          <span class="muted">${props.entries.length} configured profile${props.entries.length === 1 ? "" : "s"}</span>
        </div>
        <div class="api-keys-provider-grid">
          ${PROVIDERS.map((provider) => renderProviderCard(provider, props, selectedProvider))}
        </div>
      </section>

      <section class="card api-keys-section">
        <div class="row" style="justify-content: space-between; align-items: center; gap: 12px;">
          <div>
            <div class="card-title">Configured keys</div>
            <div class="card-sub">Masked secrets stay in the UI; raw keys are never returned by the gateway.</div>
          </div>
          <button
            type="button"
            class="btn primary"
            ?disabled=${!props.connected || props.saving}
            @click=${() => props.onOpenAdd(selectedProvider)}
          >
            ${icons.plus}
            Add new API key
          </button>
        </div>

        ${
          props.entries.length === 0
            ? html`<div class="callout info" style="margin-top: 14px;">
                No provider profiles configured yet. Add a key to start hot-reloading providers.
              </div>`
            : html`<div class="api-keys-list">
                ${props.entries.map((entry) => renderKeyRow(entry, props))}
              </div>`
        }

        ${props.formOpen ? renderAddKeyForm(props) : nothing}
      </section>

      ${renderModelSelector(props, selectedProvider)}

      ${
        props.toast
          ? html`<div class="api-keys-toast api-keys-toast--${props.toast.kind}" role="status">
              ${props.toast.message}
            </div>`
          : nothing
      }
    </section>
  `;
}
