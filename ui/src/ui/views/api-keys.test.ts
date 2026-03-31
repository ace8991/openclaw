/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { ApiKeysViewProps } from "./api-keys.ts";
import { renderApiKeys } from "./api-keys.ts";

function buildProps(overrides: Partial<ApiKeysViewProps> = {}): ApiKeysViewProps {
  return {
    connected: true,
    loading: false,
    saving: false,
    error: null,
    entries: [
      {
        profileId: "openai-primary",
        provider: "openai",
        name: "Primary OpenAI",
        maskedKey: "sk-test••••••••1234",
        baseUrl: null,
        isActive: true,
        isValidFormat: true,
      },
      {
        profileId: "lmstudio-local",
        provider: "lmstudio",
        name: "Local LM Studio",
        maskedKey: "lm-local••••••••0001",
        baseUrl: "http://127.0.0.1:1234/v1",
        isActive: false,
        isValidFormat: true,
      },
    ],
    modelCatalog: [
      { id: "gpt-4.1-mini", name: "gpt-4.1-mini", provider: "openai" },
      { id: "gpt-4.1", name: "gpt-4.1", provider: "openai" },
      { id: "local-model", name: "local-model", provider: "lmstudio" },
    ],
    defaultModel: "openai/gpt-4.1-mini",
    activeProvider: "openai",
    lastReloadAt: 1_710_000_000_000,
    reveal: {},
    formOpen: false,
    form: {
      profileId: null,
      provider: "openai",
      label: "",
      key: "",
      baseUrl: "",
    },
    formError: null,
    toast: null,
    invalidCount: 0,
    onReload: () => undefined,
    onOpenAdd: () => undefined,
    onOpenEdit: () => undefined,
    onCloseForm: () => undefined,
    onFormPatch: () => undefined,
    onSave: () => undefined,
    onDelete: () => undefined,
    onSetActive: () => undefined,
    onToggleMask: () => undefined,
    onSetDefaultModel: () => undefined,
    ...overrides,
  };
}

describe("api keys view", () => {
  it("renders provider cards, key rows, and status messaging", async () => {
    const container = document.createElement("div");
    render(
      renderApiKeys(
        buildProps({
          invalidCount: 1,
          toast: { kind: "success", message: "Key saved - gateway reloaded!" },
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.querySelectorAll(".api-keys-provider-card")).toHaveLength(7);
    expect(container.textContent).toContain("Hot-reload API key manager");
    expect(container.textContent).toContain("Configured keys");
    expect(container.textContent).toContain("Primary OpenAI");
    expect(container.textContent).toContain("Key saved - gateway reloaded!");
  });

  it("submits the selected default model", async () => {
    const onSetDefaultModel = vi.fn();
    const container = document.createElement("div");
    render(
      renderApiKeys(
        buildProps({
          onSetDefaultModel,
        }),
      ),
      container,
    );
    await Promise.resolve();

    const select = container.querySelector<HTMLSelectElement>('select[name="default-model"]');
    const form = container.querySelector<HTMLFormElement>(".api-keys-model-form");
    expect(select).not.toBeNull();
    expect(form).not.toBeNull();
    if (!select || !form) {
      return;
    }

    select.value = "openai/gpt-4.1";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(onSetDefaultModel).toHaveBeenCalledWith("openai/gpt-4.1");
  });
});
