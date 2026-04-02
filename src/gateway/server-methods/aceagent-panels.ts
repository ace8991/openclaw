import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { resolveDefaultAgentWorkspaceDir } from "../../agents/workspace.js";
import { loadConfig } from "../../config/config.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { isLocalGatewayAddress } from "../net.js";
import type { GatewayRequestHandlers } from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_FILE_PREVIEW_BYTES = 512 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 256 * 1024;
const MAX_ACE_ENTRIES = 600;
const COWORK_PROJECTS_FILE = "cowork-projects.json";

type DesktopListEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  modifiedAt?: number;
};

type CoWorkProjectFile = {
  name: string;
  content: string;
  mimeType: string;
  size: number;
};

type CoWorkProject = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  files: CoWorkProjectFile[];
  sessionKeys: string[];
  createdAt: number;
  updatedAt: number;
  color: string;
};

function requireLocalConnection(clientIp: string | undefined): string | null {
  if (isLocalGatewayAddress(clientIp)) {
    return null;
  }
  return "This method is restricted to authenticated local connections.";
}

function normalizeForCompare(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithinRoot(candidatePath: string, rootPath: string): boolean {
  const root = normalizeForCompare(rootPath);
  const candidate = normalizeForCompare(candidatePath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function dedupePaths(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeForCompare(value);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(path.resolve(value));
  }
  return output;
}

function resolveWorkspaceRoot(): string {
  try {
    return path.resolve(resolveAgentWorkspaceDir(loadConfig(), "main"));
  } catch {
    return path.resolve(resolveDefaultAgentWorkspaceDir(process.env));
  }
}

function resolveDesktopRoots(): string[] {
  const home = path.resolve(os.homedir());
  const workspace = resolveWorkspaceRoot();
  const cwd = path.resolve(process.cwd());
  return dedupePaths([home, path.join(home, ".openclaw"), workspace, cwd]);
}

function resolveDesktopPath(inputPath: string | undefined): string {
  const roots = resolveDesktopRoots();
  if (!inputPath?.trim()) {
    return roots[0] ?? path.resolve(os.homedir());
  }
  const candidate = path.resolve(inputPath.trim());
  const allowed = roots.find((root) => isWithinRoot(candidate, root));
  if (!allowed) {
    throw new Error(`Path is outside allowed roots: ${candidate}`);
  }
  return candidate;
}

async function listDirectoryEntries(dirPath: string): Promise<DesktopListEntry[]> {
  const dirents = await fs.readdir(dirPath, { withFileTypes: true });
  const entries = await Promise.all(
    dirents.map(async (dirent): Promise<DesktopListEntry> => {
      const entryPath = path.join(dirPath, dirent.name);
      let size: number | undefined;
      let modifiedAt: number | undefined;
      try {
        const stat = await fs.stat(entryPath);
        size = stat.isFile() ? stat.size : undefined;
        modifiedAt = Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : undefined;
      } catch {
        // Ignore per-entry stat failures so one unreadable entry does not fail the whole panel.
      }
      return {
        name: dirent.name,
        path: entryPath,
        type: dirent.isDirectory() ? "dir" : "file",
        size,
        modifiedAt,
      };
    }),
  );
  return entries.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "dir" ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, { numeric: true });
  });
}

async function readTextPreview(
  filePath: string,
): Promise<{ content: string; truncated: boolean; size: number }> {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    throw new Error("Path is not a regular file.");
  }
  const buffer = await fs.readFile(filePath);
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  if (sample.includes(0)) {
    throw new Error("Binary files cannot be previewed in the control UI.");
  }
  const truncated = buffer.length > MAX_FILE_PREVIEW_BYTES;
  const content = buffer.subarray(0, MAX_FILE_PREVIEW_BYTES).toString("utf8");
  return {
    content,
    truncated,
    size: stat.size,
  };
}

async function collectAceWorkspaceEntries(rootDir: string): Promise<DesktopListEntry[]> {
  const results: DesktopListEntry[] = [];
  const root = path.resolve(rootDir);

  async function walk(currentDir: string, depth: number) {
    if (results.length >= MAX_ACE_ENTRIES || depth > 6) {
      return;
    }
    const dirents = await fs.readdir(currentDir, { withFileTypes: true });
    const sorted = dirents
      .filter((entry) => !entry.name.startsWith(".git"))
      .sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) {
          return left.isDirectory() ? -1 : 1;
        }
        return left.name.localeCompare(right.name, undefined, { numeric: true });
      });
    for (const dirent of sorted) {
      if (results.length >= MAX_ACE_ENTRIES) {
        return;
      }
      const absolutePath = path.join(currentDir, dirent.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
      let size: number | undefined;
      let modifiedAt: number | undefined;
      try {
        const stat = await fs.stat(absolutePath);
        size = stat.isFile() ? stat.size : undefined;
        modifiedAt = Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : undefined;
      } catch {
        // Ignore.
      }
      results.push({
        name: dirent.name,
        path: relativePath,
        type: dirent.isDirectory() ? "dir" : "file",
        size,
        modifiedAt,
      });
      if (dirent.isDirectory()) {
        await walk(absolutePath, depth + 1);
      }
    }
  }

  await walk(root, 0);
  return results;
}

function buildCommandRunner(command: string, cwd: string) {
  if (process.platform === "win32") {
    return {
      file: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
      options: { cwd, windowsHide: true, maxBuffer: MAX_COMMAND_OUTPUT_BYTES, timeout: 30_000 },
    };
  }
  return {
    file: "sh",
    args: ["-lc", command],
    options: { cwd, maxBuffer: MAX_COMMAND_OUTPUT_BYTES, timeout: 30_000 },
  };
}

async function runCommand(command: string, cwd: string) {
  const runner = buildCommandRunner(command, cwd);
  try {
    const result = await execFileAsync(runner.file, runner.args, runner.options);
    return {
      command,
      cwd,
      code: 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } catch (error) {
    const err = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      command,
      cwd,
      code: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "Command failed.",
    };
  }
}

function sampleCpuTotals() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total +=
      cpu.times.idle +
      cpu.times.user +
      cpu.times.sys +
      cpu.times.irq +
      cpu.times.nice;
  }
  return { idle, total };
}

async function sampleCpuPercent(): Promise<number> {
  const start = sampleCpuTotals();
  await new Promise((resolve) => setTimeout(resolve, 160));
  const end = sampleCpuTotals();
  const idleDelta = end.idle - start.idle;
  const totalDelta = end.total - start.total;
  if (totalDelta <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(((totalDelta - idleDelta) / totalDelta) * 100)));
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const digits = size >= 10 || index === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[index]}`;
}

async function loadDriveSummaries(): Promise<Array<{ name: string; free: number; total: number }>> {
  if (process.platform === "win32") {
    const result = await runCommand(
      "$ErrorActionPreference='Stop'; Get-PSDrive -PSProvider FileSystem | Select-Object Name,Free,Used | ConvertTo-Json -Compress",
      process.cwd(),
    );
    const raw = `${result.stdout}`.trim();
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as Array<{ Name?: string; Free?: number; Used?: number }> | {
      Name?: string;
      Free?: number;
      Used?: number;
    };
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
      .map((entry) => {
        const free = Number(entry.Free ?? 0);
        const used = Number(entry.Used ?? 0);
        return {
          name: String(entry.Name ?? "").trim(),
          free: Number.isFinite(free) ? free : 0,
          total: Math.max(0, free + used),
        };
      })
      .filter((entry) => entry.name);
  }
  return [];
}

function readNetworkAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const values = new Set<string>();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (!entry || entry.internal || entry.family !== "IPv4") {
        continue;
      }
      values.add(entry.address);
    }
  }
  return Array.from(values).sort();
}

async function loadProcessRows(): Promise<
  Array<{ name: string; pid: number; cpu?: string; memory?: string; status?: string }>
> {
  if (process.platform === "win32") {
    const result = await runCommand(
      "$ErrorActionPreference='Stop'; Get-Process | Sort-Object -Property CPU -Descending | Select-Object -First 120 Name,Id,CPU,WS,Responding | ConvertTo-Json -Compress",
      process.cwd(),
    );
    const raw = `${result.stdout}`.trim();
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as
      | Array<{ Name?: string; Id?: number; CPU?: number; WS?: number; Responding?: boolean }>
      | { Name?: string; Id?: number; CPU?: number; WS?: number; Responding?: boolean };
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((entry) => ({
      name: String(entry.Name ?? "").trim() || "unknown",
      pid: Number(entry.Id ?? 0),
      cpu: typeof entry.CPU === "number" ? entry.CPU.toFixed(1) : undefined,
      memory: typeof entry.WS === "number" ? formatBytes(entry.WS) : undefined,
      status: entry.Responding === false ? "background" : "running",
    }));
  }
  const result = await runCommand("ps -eo pid,comm,%cpu,rss,stat --sort=-%cpu | head -n 120", "/");
  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1);
  return lines.map((line) => {
    const parts = line.split(/\s+/, 5);
    const pid = Number(parts[0] ?? 0);
    const name = parts[1] ?? "unknown";
    const cpu = parts[2];
    const rssKb = Number(parts[3] ?? 0);
    const status = parts[4];
    return {
      name,
      pid,
      cpu,
      memory: rssKb > 0 ? formatBytes(rssKb * 1024) : undefined,
      status,
    };
  });
}

function sanitizeProjectFile(value: unknown): CoWorkProjectFile | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const content = typeof record.content === "string" ? record.content : "";
  const mimeType = typeof record.mimeType === "string" ? record.mimeType : "text/plain";
  const size = typeof record.size === "number" && Number.isFinite(record.size) ? record.size : 0;
  if (!name) {
    return null;
  }
  return { name, content, mimeType, size };
}

function sanitizeProject(value: unknown): CoWorkProject | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    description: typeof record.description === "string" ? record.description : "",
    instructions: typeof record.instructions === "string" ? record.instructions : "",
    files: Array.isArray(record.files)
      ? record.files.map(sanitizeProjectFile).filter((entry): entry is CoWorkProjectFile => Boolean(entry))
      : [],
    sessionKeys: Array.isArray(record.sessionKeys)
      ? record.sessionKeys.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [],
    createdAt:
      typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
        ? record.createdAt
        : Date.now(),
    updatedAt:
      typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
        ? record.updatedAt
        : Date.now(),
    color: typeof record.color === "string" && record.color.trim() ? record.color : "#c0392b",
  };
}

async function loadCoWorkProjectsFile(): Promise<{ path: string; projects: CoWorkProject[] }> {
  const workspaceRoot = resolveWorkspaceRoot();
  const filePath = path.join(workspaceRoot, COWORK_PROJECTS_FILE);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const projects = Array.isArray(parsed)
      ? parsed.map(sanitizeProject).filter((entry): entry is CoWorkProject => Boolean(entry))
      : [];
    return { path: filePath, projects };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return { path: filePath, projects: [] };
    }
    throw error;
  }
}

async function saveCoWorkProjectsFile(projects: CoWorkProject[]): Promise<{ path: string; updatedAt: number }> {
  const workspaceRoot = resolveWorkspaceRoot();
  const filePath = path.join(workspaceRoot, COWORK_PROJECTS_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const sanitized = projects
    .map(sanitizeProject)
    .filter((entry): entry is CoWorkProject => Boolean(entry));
  await fs.writeFile(filePath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
  return { path: filePath, updatedAt: Date.now() };
}

export const aceAgentPanelsHandlers: GatewayRequestHandlers = {
  "ace.files.list": async ({ client, respond }) => {
    const authError = requireLocalConnection(client?.clientIp);
    if (authError) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, authError));
      return;
    }
    try {
      const rootPath = resolveWorkspaceRoot();
      const entries = await collectAceWorkspaceEntries(rootPath);
      respond(true, { rootPath, currentPath: rootPath, entries });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  "ace.file.read": async ({ client, params, respond }) => {
    const authError = requireLocalConnection(client?.clientIp);
    if (authError) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, authError));
      return;
    }
    const relativePath = typeof params.path === "string" ? params.path.trim() : "";
    if (!relativePath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path is required"));
      return;
    }
    try {
      const rootPath = resolveWorkspaceRoot();
      const absolutePath = path.resolve(rootPath, relativePath);
      if (!isWithinRoot(absolutePath, rootPath)) {
        throw new Error("Path escapes workspace root.");
      }
      const preview = await readTextPreview(absolutePath);
      respond(true, {
        path: relativePath,
        absolutePath,
        ...preview,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },
  "ace.command.run": async ({ client, params, respond }) => {
    const authError = requireLocalConnection(client?.clientIp);
    if (authError) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, authError));
      return;
    }
    const command = typeof params.command === "string" ? params.command.trim() : "";
    if (!command) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "command is required"));
      return;
    }
    try {
      const cwd = resolveWorkspaceRoot();
      const result = await runCommand(command, cwd);
      respond(true, result);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  "cowork.projects.get": async ({ client, respond }) => {
    const authError = requireLocalConnection(client?.clientIp);
    if (authError) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, authError));
      return;
    }
    try {
      respond(true, await loadCoWorkProjectsFile());
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  "cowork.projects.set": async ({ client, params, respond }) => {
    const authError = requireLocalConnection(client?.clientIp);
    if (authError) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, authError));
      return;
    }
    if (!Array.isArray(params.projects)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projects must be an array"),
      );
      return;
    }
    try {
      const result = await saveCoWorkProjectsFile(params.projects as CoWorkProject[]);
      respond(true, { success: true, ...result });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  "desktop.fs.list": async ({ client, params, respond }) => {
    const authError = requireLocalConnection(client?.clientIp);
    if (authError) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, authError));
      return;
    }
    try {
      const currentPath = resolveDesktopPath(
        typeof params.path === "string" ? params.path : undefined,
      );
      const entries = await listDirectoryEntries(currentPath);
      respond(true, {
        currentPath,
        roots: resolveDesktopRoots(),
        entries,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },
  "desktop.fs.read": async ({ client, params, respond }) => {
    const authError = requireLocalConnection(client?.clientIp);
    if (authError) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, authError));
      return;
    }
    const requestedPath = typeof params.path === "string" ? params.path : "";
    if (!requestedPath.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path is required"));
      return;
    }
    try {
      const filePath = resolveDesktopPath(requestedPath);
      const preview = await readTextPreview(filePath);
      respond(true, {
        path: filePath,
        ...preview,
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },
  "desktop.command.run": async ({ client, params, respond }) => {
    const authError = requireLocalConnection(client?.clientIp);
    if (authError) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, authError));
      return;
    }
    const command = typeof params.command === "string" ? params.command.trim() : "";
    if (!command) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "command is required"));
      return;
    }
    try {
      const cwd = resolveDesktopPath(
        typeof params.cwd === "string" && params.cwd.trim() ? params.cwd : undefined,
      );
      const result = await runCommand(command, cwd);
      respond(true, result);
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },
  "desktop.processes.list": async ({ client, respond }) => {
    const authError = requireLocalConnection(client?.clientIp);
    if (authError) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, authError));
      return;
    }
    try {
      respond(true, {
        sampledAt: Date.now(),
        items: await loadProcessRows(),
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
  "desktop.process.kill": async ({ client, params, respond }) => {
    const authError = requireLocalConnection(client?.clientIp);
    if (authError) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, authError));
      return;
    }
    const pid = typeof params.pid === "number" ? params.pid : Number(params.pid);
    if (!Number.isInteger(pid) || pid <= 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "pid must be a positive integer"));
      return;
    }
    try {
      process.kill(pid);
      respond(true, { success: true, pid });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(error)));
    }
  },
  "desktop.system.info": async ({ client, respond }) => {
    const authError = requireLocalConnection(client?.clientIp);
    if (authError) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, authError));
      return;
    }
    try {
      const [cpuPercent, drives] = await Promise.all([sampleCpuPercent(), loadDriveSummaries()]);
      const ramTotal = os.totalmem();
      const ramUsed = ramTotal - os.freemem();
      const diskTotal = drives.reduce((sum, entry) => sum + entry.total, 0);
      const diskFree = drives.reduce((sum, entry) => sum + entry.free, 0);
      respond(true, {
        cpuPercent,
        ramUsed,
        ramTotal,
        diskFree: formatBytes(diskFree),
        diskTotal: formatBytes(diskTotal),
        os: `${os.type()} ${os.release()}`,
        network: readNetworkAddresses(),
        drives: drives.map((drive) => ({
          name: drive.name,
          free: formatBytes(drive.free),
          total: formatBytes(drive.total),
        })),
      });
    } catch (error) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(error)));
    }
  },
};
