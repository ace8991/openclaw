import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  DcFileEntry,
  DcProcess,
  DcSystemStats,
  DesktopCommanderProps,
} from "../views/desktop-commander-panel.ts";

type DesktopFsListResult = {
  currentPath?: string;
  roots?: string[];
  entries?: Array<{
    name: string;
    path: string;
    type: "file" | "dir";
    size?: number;
    modifiedAt?: number;
  }>;
};

type DesktopFsReadResult = {
  path?: string;
  content?: string;
  truncated?: boolean;
  size?: number;
};

type DesktopCommandResult = {
  code?: number;
  stdout?: string;
  stderr?: string;
};

type DesktopProcessesResult = {
  sampledAt?: number;
  items?: DcProcess[];
};

type DesktopSystemInfoResult = {
  cpuPercent?: number;
  ramUsed?: number;
  ramTotal?: number;
  diskFree?: string;
  diskTotal?: string;
  os?: string;
  network?: string[];
  drives?: Array<{ name: string; free: string; total: string }>;
};

export type DesktopCommanderTab = DesktopCommanderProps["activeTab"];

export type DesktopCommanderState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  desktopCmdLoading: boolean;
  desktopCmdError: string | null;
  desktopCmdActiveTab: DesktopCommanderTab;
  desktopCmdCurrentPath: string;
  desktopCmdRoots: string[];
  desktopCmdFiles: DcFileEntry[];
  desktopCmdSelectedFile: string | null;
  desktopCmdSelectedFileContent: string | null;
  desktopCmdTerminalLines: string[];
  desktopCmdProcesses: DcProcess[];
  desktopCmdProcessFilter: string;
  desktopCmdSystemStats: DcSystemStats | null;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(value: number | undefined): string | undefined {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return undefined;
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value as number;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

function formatDate(value: number | undefined): string | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return new Date(value as number).toLocaleString();
}

function appendTerminalLine(state: DesktopCommanderState, line: string) {
  state.desktopCmdTerminalLines = [...state.desktopCmdTerminalLines, line];
}

function appendTerminalBlock(state: DesktopCommanderState, value: string, prefix = "> ") {
  const lines = value.split(/\r?\n/).filter((line, index, all) => line || index < all.length - 1);
  for (const line of lines) {
    appendTerminalLine(state, `${prefix}${line}`);
  }
}

export function filterDesktopProcesses(
  processes: DcProcess[],
  query: string,
): DcProcess[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return processes;
  }
  return processes.filter((entry) => {
    return (
      entry.name.toLowerCase().includes(trimmed) ||
      String(entry.pid).includes(trimmed) ||
      (entry.status ?? "").toLowerCase().includes(trimmed)
    );
  });
}

export async function loadDesktopDirectory(
  state: DesktopCommanderState,
  requestedPath?: string,
) {
  if (!state.client || !state.connected) {
    return;
  }
  state.desktopCmdLoading = true;
  state.desktopCmdError = null;
  try {
    const result = await state.client.request<DesktopFsListResult>("desktop.fs.list", {
      path: requestedPath ?? state.desktopCmdCurrentPath,
    });
    state.desktopCmdCurrentPath = result.currentPath?.trim() || state.desktopCmdCurrentPath || "";
    state.desktopCmdRoots = Array.isArray(result.roots) ? result.roots : state.desktopCmdRoots;
    state.desktopCmdFiles = (result.entries ?? []).map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type,
      size: formatBytes(entry.size),
      modified: formatDate(entry.modifiedAt),
    }));
  } catch (error) {
    state.desktopCmdError = toErrorMessage(error);
  } finally {
    state.desktopCmdLoading = false;
  }
}

export async function openDesktopFile(state: DesktopCommanderState, filePath: string) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    const result = await state.client.request<DesktopFsReadResult>("desktop.fs.read", {
      path: filePath,
    });
    state.desktopCmdSelectedFile = result.path?.trim() || filePath;
    state.desktopCmdSelectedFileContent = result.content ?? "";
    state.desktopCmdError = null;
  } catch (error) {
    state.desktopCmdError = toErrorMessage(error);
  }
}

export async function runDesktopCommand(state: DesktopCommanderState, command: string) {
  if (!state.client || !state.connected) {
    return;
  }
  const trimmed = command.trim();
  if (!trimmed) {
    return;
  }
  appendTerminalLine(state, `$ ${trimmed}`);
  try {
    const result = await state.client.request<DesktopCommandResult>("desktop.command.run", {
      command: trimmed,
      cwd: state.desktopCmdCurrentPath,
    });
    if (result.stdout) {
      appendTerminalBlock(state, result.stdout);
    }
    if (result.stderr) {
      appendTerminalBlock(state, result.stderr, "ERR ");
    }
    if (typeof result.code === "number" && result.code !== 0) {
      appendTerminalLine(state, `ERR Command exited with code ${result.code}`);
    }
    if (state.desktopCmdActiveTab === "files") {
      await loadDesktopDirectory(state);
    }
  } catch (error) {
    appendTerminalLine(state, `ERR ${toErrorMessage(error)}`);
  }
}

export function clearDesktopTerminal(state: DesktopCommanderState) {
  state.desktopCmdTerminalLines = [];
}

export async function loadDesktopProcesses(state: DesktopCommanderState) {
  if (!state.client || !state.connected) {
    return;
  }
  state.desktopCmdLoading = true;
  state.desktopCmdError = null;
  try {
    const result = await state.client.request<DesktopProcessesResult>("desktop.processes.list", {});
    state.desktopCmdProcesses = Array.isArray(result.items) ? result.items : [];
  } catch (error) {
    state.desktopCmdError = toErrorMessage(error);
  } finally {
    state.desktopCmdLoading = false;
  }
}

export async function killDesktopProcess(state: DesktopCommanderState, pid: number) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    await state.client.request("desktop.process.kill", { pid });
    state.desktopCmdProcesses = state.desktopCmdProcesses.filter((entry) => entry.pid !== pid);
    appendTerminalLine(state, `> Process ${pid} terminated.`);
  } catch (error) {
    const message = toErrorMessage(error);
    state.desktopCmdError = message;
    appendTerminalLine(state, `ERR ${message}`);
  }
}

export async function loadDesktopSystemInfo(state: DesktopCommanderState) {
  if (!state.client || !state.connected) {
    return;
  }
  state.desktopCmdLoading = true;
  state.desktopCmdError = null;
  try {
    const result = await state.client.request<DesktopSystemInfoResult>("desktop.system.info", {});
    state.desktopCmdSystemStats = {
      cpuPercent: result.cpuPercent ?? 0,
      ramUsed: result.ramUsed ?? 0,
      ramTotal: result.ramTotal ?? 0,
      diskFree: result.diskFree ?? "0 B",
      diskTotal: result.diskTotal ?? "0 B",
      os: result.os ?? "",
      network: Array.isArray(result.network) ? result.network : [],
      drives: Array.isArray(result.drives) ? result.drives : [],
    };
  } catch (error) {
    state.desktopCmdError = toErrorMessage(error);
  } finally {
    state.desktopCmdLoading = false;
  }
}

export function setDesktopProcessFilter(state: DesktopCommanderState, value: string) {
  state.desktopCmdProcessFilter = value;
}

export async function setDesktopTab(
  state: DesktopCommanderState,
  tab: DesktopCommanderTab,
) {
  state.desktopCmdActiveTab = tab;
  await refreshDesktopPanel(state);
}

export async function refreshDesktopPanel(state: DesktopCommanderState) {
  if (state.desktopCmdActiveTab === "files") {
    await loadDesktopDirectory(state);
    return;
  }
  if (state.desktopCmdActiveTab === "terminal") {
    return;
  }
  if (state.desktopCmdActiveTab === "processes") {
    await loadDesktopProcesses(state);
    return;
  }
  await loadDesktopSystemInfo(state);
}
