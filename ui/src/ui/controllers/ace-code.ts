import { extractText } from "../chat/message-extract.ts";
import type { GatewayBrowserClient } from "../gateway.ts";
import type { ChatMessage, FileDiff, FileEntry } from "../views/ace-code.ts";

const MAX_INLINE_FILE_CHARS = 16_000;

type AceFileListResult = {
  rootPath?: string;
  currentPath?: string;
  entries?: Array<{
    name: string;
    path: string;
    type: "file" | "dir";
    size?: number;
    modifiedAt?: number;
  }>;
};

type AceFileReadResult = {
  path?: string;
  content?: string;
  truncated?: boolean;
  size?: number;
};

type AceCommandResult = {
  command?: string;
  cwd?: string;
  code?: number;
  stdout?: string;
  stderr?: string;
};

export type AceCodeState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  handleSendChat: (messageOverride?: string, opts?: { restoreDraft?: boolean }) => Promise<void>;
  aceCodeLoading: boolean;
  aceCodeError: string | null;
  aceCodeWorkspacePath: string;
  aceCodeFiles: FileEntry[];
  aceCodeDiffs: FileDiff[];
  aceCodeTerminalLines: string[];
  aceCodeActiveFile: string | null;
  aceCodeActiveFileContent: string | null;
  aceCodeOpenTabs: FileEntry[];
  aceCodeSidebarOpen: boolean;
};

function normalizeAcePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").trim();
}

function basename(value: string): string {
  const normalized = normalizeAcePath(value);
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? normalized;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function markModifiedFiles(entries: FileEntry[], diffs: FileDiff[]): FileEntry[] {
  const changed = new Set(diffs.map((entry) => normalizeAcePath(entry.path)));
  return entries.map((entry) => ({
    ...entry,
    modified: changed.has(normalizeAcePath(entry.path)),
  }));
}

function upsertAceTab(state: AceCodeState, file: FileEntry) {
  const existingIndex = state.aceCodeOpenTabs.findIndex(
    (entry) => normalizeAcePath(entry.path) === normalizeAcePath(file.path),
  );
  if (existingIndex >= 0) {
    const next = [...state.aceCodeOpenTabs];
    next[existingIndex] = file;
    state.aceCodeOpenTabs = next;
    return;
  }
  state.aceCodeOpenTabs = [...state.aceCodeOpenTabs, file];
}

function upsertAceFile(state: AceCodeState, file: FileEntry) {
  const existingIndex = state.aceCodeFiles.findIndex(
    (entry) => normalizeAcePath(entry.path) === normalizeAcePath(file.path),
  );
  if (existingIndex >= 0) {
    const next = [...state.aceCodeFiles];
    next[existingIndex] = file;
    state.aceCodeFiles = next;
    return;
  }
  state.aceCodeFiles = markModifiedFiles([...state.aceCodeFiles, file], state.aceCodeDiffs).sort(
    (left, right) => {
      if (left.type !== right.type) {
        return left.type === "dir" ? -1 : 1;
      }
      return normalizeAcePath(left.path).localeCompare(normalizeAcePath(right.path));
    },
  );
}

function setAceDiff(state: AceCodeState, diff: FileDiff | null) {
  if (!diff) {
    return;
  }
  const next = state.aceCodeDiffs.filter(
    (entry) => normalizeAcePath(entry.path) !== normalizeAcePath(diff.path),
  );
  next.push(diff);
  state.aceCodeDiffs = next;
  state.aceCodeFiles = markModifiedFiles(state.aceCodeFiles, next);
  state.aceCodeOpenTabs = markModifiedFiles(state.aceCodeOpenTabs, next);
}

function appendTerminalBlock(state: AceCodeState, value: string, prefix = "> ") {
  const lines = value.split(/\r?\n/).filter((line, index, all) => line || index < all.length - 1);
  if (lines.length === 0) {
    return;
  }
  state.aceCodeTerminalLines = [
    ...state.aceCodeTerminalLines,
    ...lines.map((line) => `${prefix}${line}`),
  ];
}

function formatInlineWorkspaceFile(file: File): Promise<string> {
  return file.text().then((content) => {
    const safeContent = content.slice(0, MAX_INLINE_FILE_CHARS);
    const language = file.name.split(".").pop()?.trim() || "text";
    const truncated =
      content.length > safeContent.length
        ? `\n[truncated to ${safeContent.length} chars for chat context]`
        : "";
    return `File: ${file.name}\n\`\`\`${language}\n${safeContent}${truncated}\n\`\`\``;
  });
}

function resolveAceChatRole(value: unknown): "user" | "assistant" | null {
  const role = typeof value === "string" ? value.toLowerCase() : "";
  if (role === "user") {
    return "user";
  }
  if (role === "assistant" || role === "toolresult" || role === "system") {
    return "assistant";
  }
  return null;
}

export function mapAceCodeChatMessages(messages: unknown[]): ChatMessage[] {
  return messages
    .map((entry) => {
      const record = entry as Record<string, unknown>;
      const role = resolveAceChatRole(record.role);
      if (!role) {
        return null;
      }
      const content = extractText(entry)?.trim() ?? "";
      return {
        role,
        content,
        timestamp: typeof record.timestamp === "number" ? record.timestamp : Date.now(),
      } satisfies ChatMessage;
    })
    .filter((entry): entry is ChatMessage => Boolean(entry));
}

export async function loadAceCode(state: AceCodeState) {
  if (!state.client || !state.connected || state.aceCodeLoading) {
    return;
  }
  state.aceCodeLoading = true;
  state.aceCodeError = null;
  try {
    const result = await state.client.request<AceFileListResult>("ace.files.list", {});
    const entries = Array.isArray(result.entries) ? result.entries : [];
    state.aceCodeWorkspacePath = result.rootPath?.trim() || result.currentPath?.trim() || ".";
    state.aceCodeFiles = markModifiedFiles(
      entries.map((entry) => ({
        name: entry.name,
        path: normalizeAcePath(entry.path),
        type: entry.type,
        size: entry.size,
        modifiedAt: entry.modifiedAt,
      })),
      state.aceCodeDiffs,
    );
    state.aceCodeOpenTabs = state.aceCodeOpenTabs
      .map((tab) =>
        state.aceCodeFiles.find(
          (entry) => normalizeAcePath(entry.path) === normalizeAcePath(tab.path),
        ) ?? tab,
      )
      .filter((tab) => tab.type === "file");
  } catch (error) {
    state.aceCodeError = toErrorMessage(error);
  } finally {
    state.aceCodeLoading = false;
  }
}

export async function openAceCodeFile(state: AceCodeState, filePath: string) {
  if (!state.client || !state.connected) {
    return;
  }
  const normalizedPath = normalizeAcePath(filePath);
  const existingFile =
    state.aceCodeFiles.find((entry) => normalizeAcePath(entry.path) === normalizedPath) ?? {
      name: basename(normalizedPath),
      path: normalizedPath,
      type: "file" as const,
    };
  try {
    const result = await state.client.request<AceFileReadResult>("ace.file.read", {
      path: normalizedPath,
    });
    state.aceCodeActiveFile = normalizedPath;
    state.aceCodeActiveFileContent = result.content ?? "";
    const nextFile: FileEntry = {
      ...existingFile,
      path: normalizeAcePath(result.path ?? normalizedPath),
      type: "file",
    };
    upsertAceFile(state, nextFile);
    upsertAceTab(state, nextFile);
    state.aceCodeError = null;
  } catch (error) {
    state.aceCodeError = toErrorMessage(error);
  }
}

export function closeAceCodeTab(state: AceCodeState, filePath: string) {
  const normalizedPath = normalizeAcePath(filePath);
  state.aceCodeOpenTabs = state.aceCodeOpenTabs.filter(
    (entry) => normalizeAcePath(entry.path) !== normalizedPath,
  );
  if (normalizeAcePath(state.aceCodeActiveFile ?? "") !== normalizedPath) {
    return;
  }
  const nextTab = state.aceCodeOpenTabs[state.aceCodeOpenTabs.length - 1] ?? null;
  state.aceCodeActiveFile = nextTab?.path ?? null;
  state.aceCodeActiveFileContent = null;
  if (nextTab?.path) {
    void openAceCodeFile(state, nextTab.path);
  }
}

export function clearAceCodeTerminal(state: AceCodeState) {
  state.aceCodeTerminalLines = [];
}

export function toggleAceCodeSidebar(state: AceCodeState) {
  state.aceCodeSidebarOpen = !state.aceCodeSidebarOpen;
}

export async function runAceCodeCommand(state: AceCodeState, command: string) {
  if (!state.client || !state.connected) {
    return;
  }
  const trimmed = command.trim();
  if (!trimmed) {
    return;
  }
  state.aceCodeTerminalLines = [...state.aceCodeTerminalLines, `$ ${trimmed}`];
  try {
    const result = await state.client.request<AceCommandResult>("ace.command.run", {
      command: trimmed,
    });
    if (result.stdout) {
      appendTerminalBlock(state, result.stdout);
    }
    if (result.stderr) {
      appendTerminalBlock(state, result.stderr, "ERR ");
    }
    if (typeof result.code === "number" && result.code !== 0) {
      state.aceCodeTerminalLines = [
        ...state.aceCodeTerminalLines,
        `ERR Command exited with code ${result.code}`,
      ];
    }
    await loadAceCode(state);
  } catch (error) {
    state.aceCodeTerminalLines = [
      ...state.aceCodeTerminalLines,
      `ERR ${toErrorMessage(error)}`,
    ];
  }
}

export async function sendAceCodeMessage(
  state: AceCodeState,
  message: string,
  files?: File[],
): Promise<void> {
  const trimmed = message.trim();
  if (!trimmed && (!files || files.length === 0)) {
    return;
  }
  const fileSections =
    files && files.length > 0
      ? await Promise.all(files.map((file) => formatInlineWorkspaceFile(file)))
      : [];
  const composedMessage = [
    trimmed,
    fileSections.length > 0 ? "Workspace files for this request:\n\n" + fileSections.join("\n\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  await state.handleSendChat(composedMessage, { restoreDraft: false });
}

export async function openAceCodeSnippet(
  state: AceCodeState,
  filePath: string,
  content: string,
): Promise<void> {
  const normalizedPath = normalizeAcePath(filePath);
  const nextContent = content.replace(/\r\n/g, "\n");
  let beforeContent = "";
  let status: FileDiff["status"] = "added";
  try {
    if (state.client && state.connected) {
      const result = await state.client.request<AceFileReadResult>("ace.file.read", {
        path: normalizedPath,
      });
      beforeContent = result.content?.replace(/\r\n/g, "\n") ?? "";
      status = beforeContent ? "modified" : "added";
      state.aceCodeActiveFileContent = result.content ?? "";
    }
  } catch {
    status = "added";
    state.aceCodeActiveFileContent = "";
  }

  if (beforeContent === nextContent) {
    state.aceCodeDiffs = state.aceCodeDiffs.filter(
      (entry) => normalizeAcePath(entry.path) !== normalizedPath,
    );
    state.aceCodeFiles = markModifiedFiles(state.aceCodeFiles, state.aceCodeDiffs);
    state.aceCodeOpenTabs = markModifiedFiles(state.aceCodeOpenTabs, state.aceCodeDiffs);
  } else {
    setAceDiff(state, {
      path: normalizedPath,
      before: beforeContent,
      after: nextContent,
      status,
    });
  }

  const fileEntry: FileEntry = {
    name: basename(normalizedPath),
    path: normalizedPath,
    type: "file",
    modified: beforeContent !== nextContent,
  };
  upsertAceFile(state, fileEntry);
  upsertAceTab(state, fileEntry);
  state.aceCodeActiveFile = normalizedPath;
}
