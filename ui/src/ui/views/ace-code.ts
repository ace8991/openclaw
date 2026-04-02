import { html, nothing, type TemplateResult } from "lit";
import { icons } from "../icons.ts";

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  modified?: boolean;
  modifiedAt?: number;
  language?: string;
};

export type FileDiff = {
  path: string;
  before: string;
  after: string;
  status: "added" | "modified" | "deleted";
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  files?: string[];
};

export type AceCodeProps = {
  workspacePath: string;
  files: FileEntry[];
  diffs: FileDiff[];
  terminalLines: string[];
  activeFile: string | null;
  activeFileContent: string | null;
  openTabs: FileEntry[];
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  connected: boolean;
  sidebarOpen: boolean;
  error?: string | null;
  onFileSelect: (path: string) => void;
  onCloseTab: (path: string) => void;
  onRunCommand: (cmd: string) => void;
  onClear: () => void;
  onRefreshFiles: () => void;
  onSendMessage: (msg: string, files?: File[]) => void;
  onToggleSidebar: () => void;
  // Claude.ai composer props
  currentBranch?: string;
  targetBranch?: string;
  currentModel?: string;
  autoAccept?: boolean;
  onToggleAutoAccept?: () => void;
  onCreatePR?: () => void;
};

function langFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript",
    js: "JavaScript",
    jsx: "JavaScript",
    py: "Python",
    rs: "Rust",
    go: "Go",
    css: "CSS",
    html: "HTML",
    json: "JSON",
    md: "Markdown",
    yaml: "YAML",
    yml: "YAML",
    sh: "Shell",
    bash: "Shell",
    sql: "SQL",
    java: "Java",
    cpp: "C++",
    c: "C",
    rb: "Ruby",
    php: "PHP",
    swift: "Swift",
    kt: "Kotlin",
  };
  return (map[ext] ?? ext.toUpperCase()) || "Text";
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fileLabel(filePath: string | null): string {
  if (!filePath) {
    return "No file selected";
  }
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}

function workspaceLabel(workspacePath: string): string {
  const parts = workspacePath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? workspacePath;
}

function renderWorkspaceHeader(props: AceCodeProps): TemplateResult {
  const changedCount = props.diffs.length;
  const fileCount = props.files.filter((entry) => entry.type === "file").length;
  return html`
    <header class="ace-workspace-header">
      <div class="ace-workspace-header__left">
        <button
          class="ace-header-btn"
          type="button"
          @click=${props.onToggleSidebar}
          title=${props.sidebarOpen ? "Hide file explorer" : "Show file explorer"}
        >
          ${props.sidebarOpen ? icons.panelLeftClose : icons.panelLeftOpen}
        </button>
        <div class="ace-workspace-header__copy">
          <div class="ace-workspace-title">Ace Code</div>
          <div class="ace-workspace-path" title=${props.workspacePath}>${props.workspacePath}</div>
        </div>
      </div>
      <div class="ace-workspace-header__center">
        <span class="ace-pill">${fileCount} files</span>
        <span class="ace-pill ${changedCount > 0 ? "ace-pill--warning" : ""}">
          ${changedCount} changes
        </span>
        <span class="ace-pill">${props.openTabs.length} open tabs</span>
      </div>
      <div class="ace-workspace-header__right">
        <span class="ace-connection ${props.connected ? "ace-connection--online" : "ace-connection--offline"}">
          ${props.connected ? "Gateway live" : "Gateway offline"}
        </span>
        <button class="ace-header-btn" type="button" @click=${props.onRefreshFiles} title="Refresh workspace">
          ${icons.refresh}
        </button>
      </div>
    </header>
  `;
}

function renderFileSidebar(props: AceCodeProps): TemplateResult {
  return html`
    <aside class="ace-sidebar ${props.sidebarOpen ? "" : "ace-sidebar--hidden"}">
      <div class="ace-sidebar__header">
        <div>
          <div class="ace-sidebar__eyebrow">Workspace</div>
          <div class="ace-sidebar__title">Files</div>
        </div>
        <button class="ace-header-btn" type="button" @click=${props.onRefreshFiles} title="Refresh files">
          ${icons.refresh}
        </button>
      </div>
      <div class="ace-sidebar__path" title=${props.workspacePath}>${props.workspacePath}</div>
      <div class="ace-file-tree">
        ${props.files.length === 0
          ? html`<div class="ace-tree-empty">No files loaded yet.</div>`
          : props.files.map(
              (file) => html`
                <button
                  class="ace-tree-item ${file.type === "dir" ? "ace-tree-item--dir" : ""} ${file.path === props.activeFile ? "ace-tree-item--active" : ""} ${file.modified ? "ace-tree-item--modified" : ""}"
                  type="button"
                  @click=${() => {
                    if (file.type === "file") {
                      props.onFileSelect(file.path);
                    }
                  }}
                  title=${file.path}
                >
                  <span class="ace-tree-icon">${file.type === "dir" ? icons.folder : icons.fileCode}</span>
                  <span class="ace-tree-copy">
                    <span class="ace-tree-name">${file.name}</span>
                    <span class="ace-tree-path">${file.path}</span>
                  </span>
                  ${
                    file.modified
                      ? html`<span class="ace-tree-dot" aria-label="Modified"></span>`
                      : nothing
                  }
                </button>
              `,
            )}
      </div>
    </aside>
  `;
}

function renderTabBar(props: AceCodeProps): TemplateResult | typeof nothing {
  if (props.openTabs.length === 0 && !props.activeFile) {
    return nothing;
  }
  return html`
    <div class="ace-tabbar">
      <div class="ace-tabs-scroll">
        ${props.openTabs.map(
          (tab) => html`
            <div class="ace-tab ${tab.path === props.activeFile ? "ace-tab--active" : ""}">
              <button class="ace-tab__label" type="button" @click=${() => props.onFileSelect(tab.path)}>
                ${icons.fileCode}
                <span>${tab.name}</span>
              </button>
              <button class="ace-tab__close" type="button" @click=${() => props.onCloseTab(tab.path)} title="Close tab">
                ${icons.x}
              </button>
            </div>
          `,
        )}
      </div>
      <div class="ace-tabbar__meta">
        ${props.activeFile ? html`<span class="ace-lang-badge">${langFromName(props.activeFile)}</span>` : nothing}
      </div>
    </div>
  `;
}

function renderDiffContent(props: AceCodeProps, diff: FileDiff): TemplateResult {
  const beforeLines = diff.before.split("\n");
  const afterLines = diff.after.split("\n");
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  const rows: Array<{ text: string; cls: string }> = [];

  for (let index = 0; index < maxLen; index += 1) {
    const before = index < beforeLines.length ? beforeLines[index] : undefined;
    const after = index < afterLines.length ? afterLines[index] : undefined;
    if (before !== after) {
      if (before !== undefined) {
        rows.push({ text: `- ${before}`, cls: "ace-code-line--removed" });
      }
      if (after !== undefined) {
        rows.push({ text: `+ ${after}`, cls: "ace-code-line--added" });
      }
      continue;
    }
    if (after !== undefined) {
      rows.push({ text: `  ${after}`, cls: "ace-code-line--unchanged" });
    }
  }

  return html`
    <div class="ace-editor">
      <div class="ace-editor__header">
        <div class="ace-editor__title-group">
          <span class="ace-editor__file">${diff.path}</span>
          <span class="ace-editor__badge ace-editor__badge--${diff.status}">${diff.status}</span>
        </div>
        <button class="ace-header-btn" type="button" @click=${() => navigator.clipboard.writeText(diff.after)} title="Copy file content">
          ${icons.copy}
        </button>
      </div>
      <div class="ace-editor__body">
        ${rows.map(
          (row, index) => html`
            <div class="ace-code-line ${row.cls}">
              <span class="ace-code-line__number">${index + 1}</span>
              <span class="ace-code-line__content">${row.text}</span>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

function renderFileContent(props: AceCodeProps): TemplateResult {
  const diff = props.diffs.find((entry) => entry.path === props.activeFile);
  if (diff) {
    return renderDiffContent(props, diff);
  }

  if (!props.activeFile || props.activeFileContent == null) {
    return html`
      <div class="ace-editor ace-editor--empty">
        <div class="ace-empty-state">
          ${icons.code}
          <h3>Open a file or ask Ace to make a change</h3>
          <p>The global OpenClaw sidebar is hidden here so Ace Code can behave like a dedicated coding workspace.</p>
        </div>
      </div>
    `;
  }

  const lines = props.activeFileContent.split("\n");
  return html`
    <div class="ace-editor">
      <div class="ace-editor__header">
        <div class="ace-editor__title-group">
          <span class="ace-editor__file">${props.activeFile}</span>
          <span class="ace-editor__meta">${langFromName(props.activeFile)}</span>
        </div>
        <button
          class="ace-header-btn"
          type="button"
          @click=${() => navigator.clipboard.writeText(props.activeFileContent ?? "")}
          title="Copy file content"
        >
          ${icons.copy}
        </button>
      </div>
      <div class="ace-editor__body">
        ${lines.map(
          (line, index) => html`
            <div class="ace-code-line ace-code-line--unchanged">
              <span class="ace-code-line__number">${index + 1}</span>
              <span class="ace-code-line__content">${line}</span>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}

function renderTerminal(props: AceCodeProps): TemplateResult {
  return html`
    <section class="ace-terminal">
      <div class="ace-terminal__header">
        <div>
          <div class="ace-section-label">Terminal</div>
          <div class="ace-section-subtitle">Run commands inside the workspace</div>
        </div>
        <div class="ace-terminal__actions">
          <button class="ace-header-btn" type="button" @click=${props.onClear} title="Clear terminal">
            ${icons.x}
          </button>
        </div>
      </div>
      <div class="ace-terminal__body">
        ${props.terminalLines.length === 0
          ? html`<div class="ace-terminal__empty">No terminal output yet. Try <code>dir</code>, <code>pnpm test</code>, or <code>git status</code>.</div>`
          : props.terminalLines.map(
              (line) => html`
                <div
                  class=${line.startsWith("$")
                    ? "ace-terminal__line ace-terminal__line--command"
                    : line.startsWith("ERR")
                      ? "ace-terminal__line ace-terminal__line--error"
                      : "ace-terminal__line"}
                >
                  ${line}
                </div>
              `,
            )}
      </div>
      <div class="ace-terminal__input-row">
        <span class="ace-terminal__prompt">$</span>
        <input
          class="ace-terminal__input"
          type="text"
          placeholder="Run a workspace command"
          @keydown=${(event: KeyboardEvent) => {
            if (event.key !== "Enter") {
              return;
            }
            const target = event.target as HTMLInputElement;
            const command = target.value.trim();
            if (!command) {
              return;
            }
            props.onRunCommand(command);
            target.value = "";
          }}
        />
        <button
          class="ace-terminal__run"
          type="button"
          @click=${(event: Event) => {
            const button = event.currentTarget as HTMLButtonElement;
            const root = button.closest(".ace-terminal");
            const input = root?.querySelector(".ace-terminal__input") as HTMLInputElement | null;
            const command = input?.value.trim() ?? "";
            if (!command) {
              return;
            }
            props.onRunCommand(command);
            if (input) {
              input.value = "";
            }
          }}
        >
          Run
        </button>
      </div>
    </section>
  `;
}

function renderChat(props: AceCodeProps): TemplateResult {
  const workspaceName = workspaceLabel(props.workspacePath);
  const activeLabel = fileLabel(props.activeFile);

  return html`
    <section class="ace-chat">
      <div class="ace-chat__header">
        <div>
          <div class="ace-section-label">Ace Chat</div>
          <div class="ace-section-subtitle">Describe the change and keep working in one place</div>
        </div>
      </div>
      <div class="ace-chat__messages">
        ${props.chatMessages.length === 0
          ? html`<div class="ace-chat__empty">Ask Ace to fix a bug, explain a file, or create a feature from this workspace.</div>`
          : props.chatMessages.map(
              (message) => html`
                <div class="ace-message ace-message--${message.role}">
                  <div class="ace-message__bubble">
                    ${
                      message.files && message.files.length > 0
                        ? html`<div class="ace-message__files">
                            ${message.files.map((file) => html`<span class="ace-message__file">${icons.fileText}${file}</span>`)}
                          </div>`
                        : nothing
                    }
                    <div class="ace-message__text">${message.content}</div>
                  </div>
                  <span class="ace-message__time">${formatTime(message.timestamp)}</span>
                </div>
              `,
            )}
        ${
          props.chatLoading
            ? html`
                <div class="ace-message ace-message--assistant">
                  <div class="ace-message__bubble ace-message__bubble--loading">
                    <span class="ace-dot"></span>
                    <span class="ace-dot"></span>
                    <span class="ace-dot"></span>
                  </div>
                </div>
              `
            : nothing
        }
      </div>
      <div class="ace-chat__composer">
        <div class="ace-chat__composer-shell">
          <div class="ace-chat__composer-top">
            <div class="ace-chat__context">
              <span class="ace-chat__context-pill ace-chat__context-pill--primary">
                ${icons.code}
                <span>${workspaceName}</span>
              </span>
              <span class="ace-chat__context-arrow">${icons.arrowLeft}</span>
              <span class="ace-chat__context-pill">
                ${props.activeFile ? activeLabel : "workspace"}
              </span>
            </div>
            <span class="ace-chat__composer-status">
              ${props.connected ? "Session live" : "Gateway offline"}
            </span>
          </div>
          <div class="ace-chat__composer-box">
            <textarea
              class="ace-chat__input"
              rows="1"
              placeholder="Reply…"
              ?disabled=${!props.connected}
              @input=${(event: Event) => {
                const target = event.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
              }}
              @keydown=${(event: KeyboardEvent) => {
                if (event.key !== "Enter" || event.shiftKey) {
                  return;
                }
                event.preventDefault();
                const target = event.target as HTMLTextAreaElement;
                const message = target.value.trim();
                if (!message) {
                  return;
                }
                props.onSendMessage(message);
                target.value = "";
                target.style.height = "auto";
              }}
            ></textarea>
            <div class="ace-chat__composer-footer">
              <div class="ace-chat__composer-tools">
                <button
                  class="ace-chat__tool"
                  type="button"
                  title="Attach files"
                  @click=${() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.multiple = true;
                    input.onchange = () => {
                      const files = input.files ? Array.from(input.files) : [];
                      if (files.length === 0) {
                        return;
                      }
                      const composer = document.querySelector(".ace-chat__input") as HTMLTextAreaElement | null;
                      const message = composer?.value?.trim() ?? "";
                      props.onSendMessage(message || "Review these files", files);
                      if (composer) {
                        composer.value = "";
                        composer.style.height = "auto";
                      }
                    };
                    input.click();
                  }}
                >
                  ${icons.plus}
                </button>
                <button class="ace-chat__mode" type="button">
                  <span>Accept edits automatically</span>
                  ${icons.chevronDown}
                </button>
              </div>
              <div class="ace-chat__composer-actions">
                <span class="ace-chat__model">${props.connected ? "AceAgent live" : "Offline"}</span>
                <button
                  class="ace-chat__send"
                  type="button"
                  ?disabled=${!props.connected}
                  @click=${(event: Event) => {
                    const button = event.currentTarget as HTMLButtonElement;
                    const root = button.closest(".ace-chat__composer-shell");
                    const input = root?.querySelector(".ace-chat__input") as HTMLTextAreaElement | null;
                    const message = input?.value.trim() ?? "";
                    if (!message) {
                      return;
                    }
                    props.onSendMessage(message);
                    if (input) {
                      input.value = "";
                      input.style.height = "auto";
                    }
                  }}
                >
                  ${icons.send}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderAceComposerBar(props: AceCodeProps): TemplateResult {
  const branch = props.currentBranch ?? "main";
  const target = props.targetBranch ?? "main";
  const model = props.currentModel ?? "gpt-4.1";
  const path = props.workspacePath ?? "C:\\Users\\User\\.openclaw";
  let inputEl: HTMLTextAreaElement | null = null;

  return html`
    <div class="ace-composer-bar">
      <!-- Branch row -->
      <div class="ace-branch-row">
        <div class="ace-branch-pill">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="3" cy="3" r="1.5" stroke="currentColor" stroke-width="1.2"/>
            <circle cx="3" cy="10" r="1.5" stroke="currentColor" stroke-width="1.2"/>
            <circle cx="10" cy="3" r="1.5" stroke="currentColor" stroke-width="1.2"/>
            <path d="M3 4.5v4M3 4.5C3 7 10 7 10 4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          <span>${branch}</span>
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style="opacity:.4;transform:rotate(-90deg)">
            <path d="M6.5 2.5L4.5 4.5l2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          <span style="opacity:.4">←</span>
          <span>${target}</span>
        </div>
        <button class="ace-pr-btn" @click=${props.onCreatePR}>
          Créer une PR
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M2.5 2.5h6M5.5 2.5v6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <!-- Input -->
      <div class="ace-reply-wrap">
        <textarea
          class="ace-reply-input"
          placeholder="Répondre..."
          rows="1"
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const ta = e.target as HTMLTextAreaElement;
              const val = ta.value.trim();
              if (val) { props.onSendMessage(val); ta.value = ""; }
            }
          }}
          @input=${(e: Event) => {
            const ta = e.target as HTMLTextAreaElement;
            ta.style.height = "auto";
            ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
          }}
        ></textarea>
      </div>

      <!-- Footer toolbar -->
      <div class="ace-composer-footer">
        <div class="ace-composer-footer__left">
          <button
            class="ace-auto-accept ${props.autoAccept ? "ace-auto-accept--on" : ""}"
            @click=${props.onToggleAutoAccept}
            title="Accepter automatiquement les modifications"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 3.5h2M3 2v3M7 3.5h4M9 2v3M2 8.5h9M4 7v3M8 7v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <span>Accepter automatiquement les modifications</span>
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M1.5 3.5L4.5 6.5l3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="ace-composer-footer__right">
          <button class="ace-model-pill" @click=${() => {}}>
            ${model}
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M1.5 3.5L4.5 6.5l3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="ace-mic-btn" title="Entrée vocale">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="4" y="1" width="5" height="7" rx="2.5" stroke="currentColor" stroke-width="1.2"/>
              <path d="M1.5 6.5C1.5 9.5 4 11.5 6.5 11.5S11.5 9.5 11.5 6.5M6.5 11.5V13" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Path bar -->
      <div class="ace-path-bar">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <rect x="1" y="2" width="9" height="7" rx="1.5" stroke="currentColor" stroke-width="1.1"/>
          <path d="M3 5h5M3 7h3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
        <span>${path}</span>
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
          <path d="M1.5 4.5h6M5.5 2.5l2 2-2 2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
      </div>
    </div>
  `;
}

export function renderAceCode(props: AceCodeProps): TemplateResult {
  return html`
    <div class="ace-panel">
      ${renderWorkspaceHeader(props)}
      <div class="ace-workspace">
        ${renderFileSidebar(props)}
        <div class="ace-main">
          ${props.error ? html`<div class="ace-inline-error">${props.error}</div>` : nothing}
          ${renderTabBar(props)}
          ${renderFileContent(props)}
          ${renderTerminal(props)}
          ${renderAceComposerBar(props)}
        </div>
      </div>
    </div>
  `;
}
