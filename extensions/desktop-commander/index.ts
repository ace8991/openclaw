import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { jsonResult, readNumberParam, readStringParam } from "openclaw/plugin-sdk";
import type { OpenClawPluginToolContext } from "../../src/plugins/types.js";

type DesktopCommanderConfig = {
  allowedPaths: string[];
  confirmDestructive: boolean;
  logCommands: boolean;
};

type ResolvedDesktopCommanderConfig = DesktopCommanderConfig & {
  allowedRoots: string[];
  baseDir: string;
};

const READ_FILE_SCHEMA = Type.Object({
  path: Type.String({ description: "File path to read." }),
});

const WRITE_FILE_SCHEMA = Type.Object({
  path: Type.String({ description: "File path to write." }),
  content: Type.String({ description: "Text content to write." }),
  append: Type.Optional(Type.Boolean({ description: "Append instead of overwrite." })),
  confirm: Type.Optional(
    Type.Boolean({ description: "Set true only after the user approved the write." }),
  ),
});

const CREATE_DIRECTORY_SCHEMA = Type.Object({
  path: Type.String({ description: "Directory path to create." }),
});

const LIST_DIRECTORY_SCHEMA = Type.Object({
  path: Type.String({ description: "Directory path to list." }),
});

const MOVE_FILE_SCHEMA = Type.Object({
  source: Type.String({ description: "Source file or directory path." }),
  destination: Type.String({ description: "Destination path." }),
  overwrite: Type.Optional(Type.Boolean({ description: "Allow replacing the destination." })),
  confirm: Type.Optional(
    Type.Boolean({ description: "Set true only after the user approved the move." }),
  ),
});

const SEARCH_FILES_SCHEMA = Type.Object({
  path: Type.String({ description: "Root directory to search within." }),
  query: Type.String({ description: "Case-insensitive filename/path fragment to match." }),
  maxResults: Type.Optional(Type.Number({ description: "Maximum matches to return." })),
});

const EXECUTE_COMMAND_SCHEMA = Type.Object({
  command: Type.String({ description: "Shell command to run." }),
  workdir: Type.Optional(Type.String({ description: "Working directory for the command." })),
  timeoutMs: Type.Optional(Type.Number({ description: "Command timeout in milliseconds." })),
  confirm: Type.Optional(
    Type.Boolean({
      description: "Required for potentially destructive shell commands after user approval.",
    }),
  ),
});

const LIST_PROCESSES_SCHEMA = Type.Object({
  filter: Type.Optional(Type.String({ description: "Optional process-name substring filter." })),
});

const KILL_PROCESS_SCHEMA = Type.Object({
  pid: Type.Number({ description: "Process id to terminate." }),
  force: Type.Optional(Type.Boolean({ description: "Use a forceful kill when supported." })),
  confirm: Type.Optional(
    Type.Boolean({ description: "Set true only after the user approved terminating the process." }),
  ),
});

const EMPTY_SCHEMA = Type.Object({});

const POTENTIALLY_DESTRUCTIVE_COMMAND_RE =
  /\b(rm|rmdir|del|erase|move-item|remove-item|ren|rename|mv|kill|taskkill|format|set-content|out-file)\b|(^|[^>])>([^>]|$)|>>/i;

function uniq(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function textResult(text: string, details?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function normalizeConfiguredPaths(
  api: OpenClawPluginApi,
  toolCtx: OpenClawPluginToolContext,
): ResolvedDesktopCommanderConfig {
  const raw = (api.pluginConfig ?? {}) as Record<string, unknown>;
  const configuredPaths = Array.isArray(raw.allowedPaths)
    ? raw.allowedPaths.filter((value): value is string => typeof value === "string")
    : [];
  const fallbackBaseDir = toolCtx.workspaceDir?.trim() || process.cwd();
  const allowedRoots = uniq(
    (configuredPaths.length > 0 ? configuredPaths : [fallbackBaseDir]).map((value) =>
      path.resolve(api.resolvePath(value)),
    ),
  );

  return {
    allowedPaths: configuredPaths,
    confirmDestructive: raw.confirmDestructive !== false,
    logCommands: raw.logCommands === true,
    allowedRoots,
    baseDir: fallbackBaseDir,
  };
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function normalizeForPolicy(filePath: string, options?: { parent?: boolean }): Promise<string> {
  const target = path.resolve(filePath);
  if (options?.parent) {
    const parent = path.dirname(target);
    try {
      return await fs.realpath(parent);
    } catch {
      return parent;
    }
  }
  try {
    return await fs.realpath(target);
  } catch {
    return target;
  }
}

async function assertAllowedPath(
  resolvedPath: string,
  config: ResolvedDesktopCommanderConfig,
  label: string,
  options?: { parent?: boolean },
): Promise<void> {
  const normalizedTarget = await normalizeForPolicy(resolvedPath, options);
  const allowed = await Promise.all(
    config.allowedRoots.map(async (root) => isPathInside(await normalizeForPolicy(root), normalizedTarget)),
  );
  if (allowed.some(Boolean)) {
    return;
  }
  throw new Error(
    `${label} must stay inside allowedPaths. Allowed roots: ${config.allowedRoots.join(", ")}`,
  );
}

function resolveInputPath(input: string, config: ResolvedDesktopCommanderConfig): string {
  return path.isAbsolute(input) ? path.resolve(input) : path.resolve(config.baseDir, input);
}

function requireConfirmationIfNeeded(
  confirmed: boolean,
  config: ResolvedDesktopCommanderConfig,
  reason: string,
): void {
  if (config.confirmDestructive && !confirmed) {
    throw new Error(`${reason}. Ask the user first, then retry with confirm=true.`);
  }
}

function maybeLogCommand(api: OpenClawPluginApi, config: ResolvedDesktopCommanderConfig, message: string) {
  if (config.logCommands) {
    api.logger.info(`[desktop-commander] ${message}`);
  }
}

async function listDirectoryEntries(dirPath: string) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const absolutePath = path.join(dirPath, entry.name);
        const stat = await fs.stat(absolutePath).catch(() => null);
        return {
          name: entry.name,
          path: absolutePath,
          kind: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
          size: stat?.size ?? null,
          modifiedAt: stat?.mtime.toISOString() ?? null,
        };
      }),
  );
}

async function movePath(source: string, destination: string, overwrite: boolean): Promise<void> {
  if (overwrite) {
    await fs.rm(destination, { recursive: true, force: true }).catch(() => {});
  }
  try {
    await fs.rename(source, destination);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    if (code !== "EXDEV") {
      throw err;
    }
    await fs.cp(source, destination, { recursive: true, force: overwrite });
    await fs.rm(source, { recursive: true, force: true });
  }
}

async function searchFiles(params: {
  rootPath: string;
  query: string;
  maxResults: number;
}): Promise<
  Array<{
    name: string;
    path: string;
    kind: "file" | "directory" | "other";
  }>
> {
  const queue = [params.rootPath];
  const matches: Array<{ name: string; path: string; kind: "file" | "directory" | "other" }> = [];
  const needle = params.query.toLowerCase();

  while (queue.length > 0 && matches.length < params.maxResults) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      const normalized = absolutePath.toLowerCase();
      const kind = entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other";
      if (entry.name.toLowerCase().includes(needle) || normalized.includes(needle)) {
        matches.push({
          name: entry.name,
          path: absolutePath,
          kind,
        });
        if (matches.length >= params.maxResults) {
          break;
        }
      }
      if (entry.isDirectory()) {
        queue.push(absolutePath);
      }
    }
  }

  return matches;
}

function normalizeProcessListPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
  }
  if (payload && typeof payload === "object") {
    return [payload as Record<string, unknown>];
  }
  return [];
}

async function listSystemProcesses(api: OpenClawPluginApi, filter?: string) {
  const needle = filter?.trim().toLowerCase() || "";
  if (process.platform === "win32") {
    const result = await api.runtime.system.runCommandWithTimeout(
      [
        "powershell.exe",
        "-NoProfile",
        "-Command",
        "Get-Process | Select-Object Id,ProcessName,CPU,@{Name='WorkingSetMB';Expression={[math]::Round($_.WorkingSet64 / 1MB, 1)}} | ConvertTo-Json -Depth 3",
      ],
      { timeoutMs: 12_000 },
    );
    const parsed = JSON.parse(result.stdout || "[]");
    return normalizeProcessListPayload(parsed)
      .map((entry) => ({
        pid: entry.Id,
        name: entry.ProcessName,
        cpu: entry.CPU ?? null,
        memoryMb: entry.WorkingSetMB ?? null,
      }))
      .filter((entry) =>
        needle ? String(entry.name ?? "").toLowerCase().includes(needle) : true,
      );
  }

  const result = await api.runtime.system.runCommandWithTimeout(
    ["ps", "-eo", "pid=,comm=,%cpu=,%mem="],
    { timeoutMs: 12_000 },
  );
  return (result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, name, cpu, memory] = line.split(/\s+/, 4);
      return {
        pid: Number.parseInt(pid ?? "", 10),
        name: name ?? "",
        cpu: cpu ? Number.parseFloat(cpu) : null,
        memoryPercent: memory ? Number.parseFloat(memory) : null,
      };
    })
    .filter((entry) => Number.isFinite(entry.pid))
    .filter((entry) => (needle ? entry.name.toLowerCase().includes(needle) : true));
}

function buildShellArgv(command: string): string[] {
  if (process.platform === "win32") {
    return ["powershell.exe", "-NoProfile", "-Command", command];
  }
  return ["/bin/bash", "-lc", command];
}

function isPotentiallyDestructiveCommand(command: string): boolean {
  return POTENTIALLY_DESTRUCTIVE_COMMAND_RE.test(command);
}

function createReadFileTool(config: ResolvedDesktopCommanderConfig): AnyAgentTool {
  return {
    name: "read_file",
    label: "read_file",
    description: "Read a text file from an allowed path.",
    parameters: READ_FILE_SCHEMA,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const requestedPath = readStringParam(params, "path", { required: true });
      const resolvedPath = resolveInputPath(requestedPath, config);
      await assertAllowedPath(resolvedPath, config, "read_file path");
      const content = await fs.readFile(resolvedPath, "utf8");
      return textResult(content, { path: resolvedPath });
    },
  };
}

function createWriteFileTool(
  api: OpenClawPluginApi,
  config: ResolvedDesktopCommanderConfig,
): AnyAgentTool {
  return {
    name: "write_file",
    label: "write_file",
    description:
      "Write a text file within an allowed path. Overwrites require confirm=true when destructive confirmation is enabled.",
    parameters: WRITE_FILE_SCHEMA,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const requestedPath = readStringParam(params, "path", { required: true });
      const content = readStringParam(params, "content", {
        required: true,
        trim: false,
        allowEmpty: true,
      });
      const append = params.append === true;
      const confirm = params.confirm === true;
      const resolvedPath = resolveInputPath(requestedPath, config);
      await assertAllowedPath(resolvedPath, config, "write_file path", { parent: true });
      const alreadyExists = await fs
        .stat(resolvedPath)
        .then(() => true)
        .catch(() => false);
      if (alreadyExists && !append) {
        requireConfirmationIfNeeded(confirm, config, "write_file would overwrite an existing file");
      }
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      if (append) {
        await fs.appendFile(resolvedPath, content, "utf8");
      } else {
        await fs.writeFile(resolvedPath, content, "utf8");
      }
      maybeLogCommand(api, config, `write_file ${resolvedPath}`);
      return textResult(`Wrote ${Buffer.byteLength(content, "utf8")} bytes to ${resolvedPath}.`, {
        path: resolvedPath,
        append,
      });
    },
  };
}

function createCreateDirectoryTool(
  api: OpenClawPluginApi,
  config: ResolvedDesktopCommanderConfig,
): AnyAgentTool {
  return {
    name: "create_directory",
    label: "create_directory",
    description: "Create a directory within an allowed path.",
    parameters: CREATE_DIRECTORY_SCHEMA,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const requestedPath = readStringParam(params, "path", { required: true });
      const resolvedPath = resolveInputPath(requestedPath, config);
      await assertAllowedPath(resolvedPath, config, "create_directory path", { parent: true });
      await fs.mkdir(resolvedPath, { recursive: true });
      maybeLogCommand(api, config, `create_directory ${resolvedPath}`);
      return textResult(`Created directory ${resolvedPath}.`, { path: resolvedPath });
    },
  };
}

function createListDirectoryTool(config: ResolvedDesktopCommanderConfig): AnyAgentTool {
  return {
    name: "list_directory",
    label: "list_directory",
    description: "List entries in an allowed directory.",
    parameters: LIST_DIRECTORY_SCHEMA,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const requestedPath = readStringParam(params, "path", { required: true });
      const resolvedPath = resolveInputPath(requestedPath, config);
      await assertAllowedPath(resolvedPath, config, "list_directory path");
      const entries = await listDirectoryEntries(resolvedPath);
      return jsonResult({
        path: resolvedPath,
        entries,
      });
    },
  };
}

function createMoveFileTool(
  api: OpenClawPluginApi,
  config: ResolvedDesktopCommanderConfig,
): AnyAgentTool {
  return {
    name: "move_file",
    label: "move_file",
    description:
      "Move or rename a file or directory within allowed paths. Requires confirm=true when destructive confirmation is enabled.",
    parameters: MOVE_FILE_SCHEMA,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const requestedSource = readStringParam(params, "source", { required: true });
      const requestedDestination = readStringParam(params, "destination", { required: true });
      const overwrite = params.overwrite === true;
      const confirm = params.confirm === true;
      const sourcePath = resolveInputPath(requestedSource, config);
      const destinationPath = resolveInputPath(requestedDestination, config);
      await assertAllowedPath(sourcePath, config, "move_file source");
      await assertAllowedPath(destinationPath, config, "move_file destination", { parent: true });
      requireConfirmationIfNeeded(confirm, config, "move_file is a destructive operation");
      if (!overwrite) {
        const destinationExists = await fs
          .stat(destinationPath)
          .then(() => true)
          .catch(() => false);
        if (destinationExists) {
          throw new Error(`Destination already exists: ${destinationPath}`);
        }
      }
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await movePath(sourcePath, destinationPath, overwrite);
      maybeLogCommand(api, config, `move_file ${sourcePath} -> ${destinationPath}`);
      return textResult(`Moved ${sourcePath} to ${destinationPath}.`, {
        source: sourcePath,
        destination: destinationPath,
        overwrite,
      });
    },
  };
}

function createSearchFilesTool(config: ResolvedDesktopCommanderConfig): AnyAgentTool {
  return {
    name: "search_files",
    label: "search_files",
    description: "Search for filenames or paths containing a query within an allowed directory.",
    parameters: SEARCH_FILES_SCHEMA,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const requestedPath = readStringParam(params, "path", { required: true });
      const query = readStringParam(params, "query", { required: true });
      const maxResults = Math.max(1, Math.min(200, readNumberParam(params, "maxResults") ?? 50));
      const resolvedPath = resolveInputPath(requestedPath, config);
      await assertAllowedPath(resolvedPath, config, "search_files path");
      const matches = await searchFiles({
        rootPath: resolvedPath,
        query,
        maxResults,
      });
      return jsonResult({
        path: resolvedPath,
        query,
        matches,
      });
    },
  };
}

function createExecuteCommandTool(
  api: OpenClawPluginApi,
  config: ResolvedDesktopCommanderConfig,
): AnyAgentTool {
  return {
    name: "execute_command",
    label: "execute_command",
    description:
      "Run a shell command from an allowed working directory. Shell commands are not path-sandboxed, so prefer file tools when strict allowedPaths enforcement matters.",
    parameters: EXECUTE_COMMAND_SCHEMA,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const command = readStringParam(params, "command", { required: true, trim: false });
      const timeoutMs = Math.max(1000, Math.min(300_000, readNumberParam(params, "timeoutMs") ?? 30_000));
      const workdir = resolveInputPath(
        readStringParam(params, "workdir") ?? config.allowedRoots[0] ?? config.baseDir,
        config,
      );
      const confirm = params.confirm === true;
      await assertAllowedPath(workdir, config, "execute_command workdir");
      if (isPotentiallyDestructiveCommand(command)) {
        requireConfirmationIfNeeded(
          confirm,
          config,
          "execute_command looks potentially destructive",
        );
      }
      maybeLogCommand(api, config, `execute_command ${command}`);
      const result = await api.runtime.system.runCommandWithTimeout(buildShellArgv(command), {
        timeoutMs,
        cwd: workdir,
      });
      const output = [result.stdout?.trimEnd(), result.stderr?.trimEnd()].filter(Boolean).join("\n\n");
      return textResult(output || "(no output)", {
        command,
        cwd: workdir,
        code: result.code,
        termination: result.termination,
      });
    },
  };
}

function createListProcessesTool(api: OpenClawPluginApi): AnyAgentTool {
  return {
    name: "list_processes",
    label: "list_processes",
    description: "List running system processes.",
    parameters: LIST_PROCESSES_SCHEMA,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const filter = readStringParam(params, "filter");
      const processes = await listSystemProcesses(api, filter);
      return jsonResult({
        filter: filter ?? null,
        processes,
      });
    },
  };
}

function createKillProcessTool(
  api: OpenClawPluginApi,
  config: ResolvedDesktopCommanderConfig,
): AnyAgentTool {
  return {
    name: "kill_process",
    label: "kill_process",
    description:
      "Terminate a system process by pid. Requires confirm=true when destructive confirmation is enabled.",
    parameters: KILL_PROCESS_SCHEMA,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const pid = Math.trunc(readNumberParam(params, "pid", { required: true }) ?? 0);
      const force = params.force === true;
      const confirm = params.confirm === true;
      requireConfirmationIfNeeded(confirm, config, "kill_process is a destructive operation");
      if (pid <= 0) {
        throw new Error("pid must be a positive integer");
      }
      if (process.platform === "win32") {
        const argv = ["taskkill", "/PID", String(pid), "/T"];
        if (force) {
          argv.push("/F");
        }
        await api.runtime.system.runCommandWithTimeout(argv, { timeoutMs: 15_000 });
      } else {
        process.kill(pid, force ? "SIGKILL" : "SIGTERM");
      }
      maybeLogCommand(api, config, `kill_process ${pid}`);
      return textResult(`Requested termination for process ${pid}.`, { pid, force });
    },
  };
}

function createSystemInfoTool(): AnyAgentTool {
  return {
    name: "get_system_info",
    label: "get_system_info",
    description: "Get basic host system information.",
    parameters: EMPTY_SCHEMA,
    execute: async () => {
      const cpus = os.cpus();
      return jsonResult({
        hostname: os.hostname(),
        platform: process.platform,
        release: os.release(),
        arch: process.arch,
        cpuModel: cpus[0]?.model ?? null,
        cpuCount: cpus.length,
        totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
        freeMemoryMb: Math.round(os.freemem() / (1024 * 1024)),
        uptimeSeconds: Math.round(os.uptime()),
        loadAverage: os.loadavg(),
      });
    },
  };
}

function createDesktopCommanderTools(
  api: OpenClawPluginApi,
  toolCtx: OpenClawPluginToolContext,
): AnyAgentTool[] {
  const config = normalizeConfiguredPaths(api, toolCtx);
  return [
    createReadFileTool(config),
    createWriteFileTool(api, config),
    createCreateDirectoryTool(api, config),
    createListDirectoryTool(config),
    createMoveFileTool(api, config),
    createSearchFilesTool(config),
    createExecuteCommandTool(api, config),
    createListProcessesTool(api),
    createKillProcessTool(api, config),
    createSystemInfoTool(),
  ];
}

export default function register(api: OpenClawPluginApi) {
  api.registerTool((toolCtx) => createDesktopCommanderTools(api, toolCtx));
}
