import type { UpdateAvailable } from "../infra/update-startup.js";

export const GATEWAY_EVENT_UPDATE_AVAILABLE = "update.available" as const;
export const GATEWAY_EVENT_SECRETS_RELOADED = "secrets:reloaded" as const;

export type GatewayUpdateAvailableEventPayload = {
  updateAvailable: UpdateAvailable | null;
};

export type GatewaySecretsReloadedEventPayload = {
  reloadedAt: number;
  source: string;
  changedProviders: string[];
  warningCount?: number;
  profileCount?: number;
};
