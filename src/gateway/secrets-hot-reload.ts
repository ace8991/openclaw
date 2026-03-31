import fs from "node:fs";
import path from "node:path";
import {
  ensureAuthProfileStore,
  type AuthProfileStore,
} from "../agents/auth-profiles.js";
import { ensureAuthStoreFile } from "../agents/auth-profiles/paths.js";
import { diffManagedProviderChanges, type ManagedApiKeyProvider } from "./api-keys.shared.js";

type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export type SecretsHotReloadResult = {
  reloadedAt: number;
  warningCount: number;
  changedProviders: ManagedApiKeyProvider[];
  profileCount: number;
  source: string;
};

type ValidatedStoreSnapshot = {
  raw: string;
  store: AuthProfileStore;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateRawCredentialEntry(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const mode = typeof value.type === "string" ? value.type : typeof value.mode === "string" ? value.mode : "";
  if (mode !== "api_key" && mode !== "oauth" && mode !== "token") {
    return false;
  }
  const provider =
    typeof value.provider === "string"
      ? value.provider.trim()
      : typeof value.provider === "number"
        ? String(value.provider)
        : "";
  return provider.length > 0;
}

function validateAuthProfilesJsonRoot(parsed: unknown): parsed is {
  version?: number;
  profiles: Record<string, unknown>;
} {
  if (!isRecord(parsed) || !isRecord(parsed.profiles)) {
    return false;
  }
  return Object.values(parsed.profiles).every((entry) => validateRawCredentialEntry(entry));
}

async function readValidatedStoreSnapshot(profilesPath: string): Promise<ValidatedStoreSnapshot> {
  const raw = await fs.promises.readFile(profilesPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!validateAuthProfilesJsonRoot(parsed)) {
    throw new Error("auth-profiles.json failed validation.");
  }
  const store = ensureAuthProfileStore(path.dirname(profilesPath), {
    allowKeychainPrompt: false,
  });
  return { raw, store: structuredClone(store) };
}

export class SecretsHotReloadService {
  private watcher: fs.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private lastStore: AuthProfileStore | null = null;
  private lastRaw: string | null = null;

  constructor(
    private readonly options: {
      profilesPath: string;
      logger: Logger;
      applyReload: (params: {
        source: string;
        nextStore: AuthProfileStore;
        changedProviders: ManagedApiKeyProvider[];
        profileCount: number;
      }) => Promise<Omit<SecretsHotReloadResult, "changedProviders" | "profileCount" | "source">>;
      debounceMs?: number;
    },
  ) {}

  async start(): Promise<void> {
    ensureAuthStoreFile(this.options.profilesPath);
    try {
      const initial = await readValidatedStoreSnapshot(this.options.profilesPath);
      this.lastStore = initial.store;
      this.lastRaw = initial.raw;
    } catch (error) {
      this.options.logger.warn(
        `[secrets-hot-reload] Initial auth profile snapshot unavailable: ${String(error)}`,
      );
    }

    const directory = path.dirname(this.options.profilesPath);
    const filename = path.basename(this.options.profilesPath);
    this.watcher = fs.watch(directory, (_eventType, changedFile) => {
      if (changedFile && String(changedFile) !== filename) {
        return;
      }
      this.scheduleReload("watch");
    });
    this.options.logger.info(`[secrets-hot-reload] Watching ${this.options.profilesPath}`);
  }

  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.watcher?.close();
    this.watcher = null;
  }

  async reloadNow(source = "manual"): Promise<SecretsHotReloadResult> {
    const snapshot = await readValidatedStoreSnapshot(this.options.profilesPath);
    if (source === "watch" && this.lastRaw !== null && snapshot.raw === this.lastRaw) {
      return {
        reloadedAt: Date.now(),
        warningCount: 0,
        changedProviders: [],
        profileCount: Object.keys(snapshot.store.profiles).length,
        source,
      };
    }

    const changedProviders = diffManagedProviderChanges({
      previous: this.lastStore,
      next: snapshot.store,
    });
    if (source === "watch" && changedProviders.length === 0 && snapshot.raw === this.lastRaw) {
      return {
        reloadedAt: Date.now(),
        warningCount: 0,
        changedProviders,
        profileCount: Object.keys(snapshot.store.profiles).length,
        source,
      };
    }

    const profileCount = Object.keys(snapshot.store.profiles).length;
    const result = await this.options.applyReload({
      source,
      nextStore: snapshot.store,
      changedProviders,
      profileCount,
    });
    this.lastStore = snapshot.store;
    this.lastRaw = snapshot.raw;
    const providerLabel = changedProviders.length > 0 ? changedProviders.join(", ") : "none";
    this.options.logger.info(
      `[secrets-hot-reload] Reloaded profiles @ ${new Date(result.reloadedAt).toISOString()} (providers: ${providerLabel})`,
    );
    return {
      reloadedAt: result.reloadedAt,
      warningCount: result.warningCount,
      changedProviders,
      profileCount,
      source,
    };
  }

  private scheduleReload(source: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    const debounceMs = this.options.debounceMs ?? 300;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.reloadNow(source).catch((error) => {
        this.options.logger.error(
          `[secrets-hot-reload] Ignored invalid auth profile update: ${String(error)}`,
        );
      });
    }, debounceMs);
  }
}
