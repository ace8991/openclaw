import type { GatewayBrowserClient } from "./gateway.ts";
import type { Tab } from "./navigation.ts";

const LIVE_VIEW_POLL_MS = 900;
const LIVE_VIEW_RETRY_MS = 2500;
const LIVE_VIEW_FPS_WINDOW_MS = 5000;

type BrowserInlineScreenshot = {
  ok: boolean;
  data?: string;
  mimeType?: string;
  targetId?: string;
  url?: string;
};

export type BrowserLiveViewHost = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  tab: Tab;
  browserLiveViewOpen: boolean;
  browserLiveViewBusy: boolean;
  browserLiveViewConnected: boolean;
  browserLiveViewError: string | null;
  browserLiveViewImageUrl: string | null;
  browserLiveViewCurrentUrl: string;
  browserLiveViewFrameCount: number;
  browserLiveViewLastFrameAt: number | null;
  browserLiveViewFps: number;
  browserLiveViewPollTimer: number | null;
  browserLiveViewFrameTimes: number[];
};

function canPoll(host: BrowserLiveViewHost): boolean {
  return host.browserLiveViewOpen && host.connected && host.tab === "chat" && host.client !== null;
}

function computeFps(frameTimes: number[], now: number): number {
  const recent = frameTimes.filter((ts) => now - ts <= LIVE_VIEW_FPS_WINDOW_MS);
  if (recent.length === 0) {
    return 0;
  }
  return Math.max(1, Math.round((recent.length * 1000) / LIVE_VIEW_FPS_WINDOW_MS));
}

function clearPollTimer(host: BrowserLiveViewHost): void {
  if (host.browserLiveViewPollTimer !== null) {
    window.clearTimeout(host.browserLiveViewPollTimer);
    host.browserLiveViewPollTimer = null;
  }
}

function scheduleNextPoll(host: BrowserLiveViewHost, delayMs: number): void {
  clearPollTimer(host);
  if (!canPoll(host)) {
    return;
  }
  host.browserLiveViewPollTimer = window.setTimeout(() => {
    host.browserLiveViewPollTimer = null;
    void pollBrowserLiveView(host);
  }, delayMs);
}

export function stopBrowserLiveViewPolling(
  host: BrowserLiveViewHost,
  options: { clearFrame?: boolean } = {},
): void {
  clearPollTimer(host);
  host.browserLiveViewBusy = false;
  host.browserLiveViewConnected = false;
  host.browserLiveViewFps = 0;
  host.browserLiveViewFrameTimes = [];
  if (options.clearFrame !== false) {
    host.browserLiveViewError = null;
    host.browserLiveViewImageUrl = null;
    host.browserLiveViewCurrentUrl = "";
    host.browserLiveViewFrameCount = 0;
    host.browserLiveViewLastFrameAt = null;
  }
}

export function toggleBrowserLiveView(host: BrowserLiveViewHost): void {
  host.browserLiveViewOpen = !host.browserLiveViewOpen;
  if (host.browserLiveViewOpen) {
    host.browserLiveViewError = null;
  }
  syncBrowserLiveViewPolling(host);
}

export function syncBrowserLiveViewPolling(host: BrowserLiveViewHost): void {
  if (!canPoll(host)) {
    stopBrowserLiveViewPolling(host, {
      clearFrame: !host.browserLiveViewOpen,
    });
    return;
  }
  if (host.browserLiveViewPollTimer !== null || host.browserLiveViewBusy) {
    return;
  }
  void pollBrowserLiveView(host);
}

export async function pollBrowserLiveView(host: BrowserLiveViewHost): Promise<void> {
  if (!canPoll(host) || host.browserLiveViewBusy || !host.client) {
    return;
  }

  host.browserLiveViewBusy = true;
  let nextDelayMs: number | null = null;

  try {
    const result = await host.client.request<BrowserInlineScreenshot>("browser.request", {
      method: "POST",
      path: "/screenshot",
      body: {
        inline: true,
        type: "jpeg",
      },
      timeoutMs: 8000,
    });

    if (!result || typeof result.data !== "string" || !result.data.trim()) {
      throw new Error("browser live view returned an empty frame");
    }

    const now = Date.now();
    const frameTimes = [...host.browserLiveViewFrameTimes, now].filter(
      (ts) => now - ts <= LIVE_VIEW_FPS_WINDOW_MS,
    );
    host.browserLiveViewFrameTimes = frameTimes;
    host.browserLiveViewBusy = false;
    host.browserLiveViewConnected = true;
    host.browserLiveViewError = null;
    host.browserLiveViewImageUrl = `data:${result.mimeType ?? "image/jpeg"};base64,${result.data}`;
    host.browserLiveViewCurrentUrl =
      typeof result.url === "string" && result.url.trim()
        ? result.url
        : host.browserLiveViewCurrentUrl;
    host.browserLiveViewFrameCount += 1;
    host.browserLiveViewLastFrameAt = now;
    host.browserLiveViewFps = computeFps(frameTimes, now);
    nextDelayMs = LIVE_VIEW_POLL_MS;
  } catch (err) {
    host.browserLiveViewBusy = false;
    host.browserLiveViewConnected = false;
    host.browserLiveViewFps = 0;
    host.browserLiveViewFrameTimes = [];
    host.browserLiveViewError =
      err instanceof Error ? err.message : `browser live view failed: ${String(err)}`;
    nextDelayMs = LIVE_VIEW_RETRY_MS;
  } finally {
    host.browserLiveViewBusy = false;
    if (nextDelayMs !== null) {
      scheduleNextPoll(host, nextDelayMs);
    }
  }
}
