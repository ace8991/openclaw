import { html, nothing, type TemplateResult } from "lit";
import { icons } from "../icons.ts";

/* ── Types ── */

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  modified?: boolean;
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
  onFileSelect: (path: string) => void;
  onCloseTab: (path: string) => void;
  onRunCommand: (cmd: string) => void;
  onClear: () => void;
  onRefreshFiles: () => void;
  onSendMessage: (msg: string, files?: File[]) => void;
  onToggleSidebar: () => void;
};

/* ── Helpers ── */

function langFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
    py: "Python", rs: "Rust", go: "Go", css: "CSS", html: "HTML",
    json: "JSON", md: "Markdown", yaml: "YAML", yml: "YAML",
    sh: "Shell", bash: "Shell", sql: "SQL", java: "Java", cpp: "C++",
    c: "C", rb: "Ruby", php: "PHP", swift: "Swift", kt: "Kotlin",
  };
  return map[ext] ?? ext.toUpperCase();
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ── File sidebar ── */

function renderFileSidebar(props: AceCodeProps): TemplateResult {
  return html`
    <aside class="ace-sidebar ${props.sidebarOpen ? "" : "ace-sidebar--hidden"}">
      <div class="ace-sidebar-top">
        <span class="ace-sidebar-label">Explorer</span>
        <button class="ace-icon-btn" @click=${props.onRefreshFiles} title="Refresh">
          ${icons.loader}
        </button>
      </div>
      <div class="ace-sidebar-section">
        <span class="ace-section-title">WORKSPACE</span>
        <span class="ace-section-path">${props.workspacePath}</span>
      </div>
      <div class="ace-file-tree">
        ${props.files.length === 0
          ? html`<div class="ace-tree-empty">No files loaded</div>`
          : props.files.map(
              (f) => html`
                <button
                  class="ace-tree-item ${f.path === props.activeFile ? "ace-tree-item--active" : ""}"
                  @click=${() => props.onFileSelect(f.path)}
                >
                  <span class="ace-tree-icon">${f.type === "dir" ? icons.folder : icons.fileText}</span>
                  <span class="ace-tree-name">${f.name}</span>
                  ${f.modified ? html`<span class="ace-tree-badge">M</span>` : nothing}
                </button>
              `,
            )}
      </div>
    </aside>
  `;
}

/* ── Tab bar ── */

function renderTabBar(props: AceCodeProps): TemplateResult {
  return html`
    <div class="ace-tabbar">
      <button class="ace-icon-btn ace-sidebar-toggle" @click=${props.onToggleSidebar} title="Toggle sidebar">
        ${icons.menu}
      </button>
      <div class="ace-tabs-scroll">
        ${props.openTabs.map(
          (tab) => html`
            <div class="ace-tab ${tab.path === props.activeFile ? "ace-tab--active" : ""}">
              <button class="ace-tab__label" @click=${() => props.onFileSelect(tab.path)}>
                ${icons.fileText}
                <span>${tab.name}</span>
              </button>
              <button class="ace-tab__close" @click=${() => props.onCloseTab(tab.path)}>
                ${icons.x}
              </button>
            </div>
          `,
        )}
      </div>
      <div class="ace-tabbar-actions">
        <span class="ace-lang-badge">${props.activeFile ? langFromName(props.activeFile) : ""}</span>
      </div>
    </div>
  `;
}

/* ── Code viewer with diff ── */

function renderCodeArea(props: AceCodeProps): TemplateResult {
  const diff = props.diffs.find((d) => d.path === props.activeFile);

  if (diff) {
    const beforeLines = diff.before.split("\n");
    const afterLines = diff.after.split("\n");
    const maxLen = Math.max(beforeLines.length, afterLines.length);
    const lines: Array<{ text: string; cls: string }> = [];
    for (let i = 0; i < maxLen; i++) {
      const b = i < beforeLines.length ? beforeLines[i] : undefined;
      const a = i < afterLines.length ? afterLines[i] : undefined;
      if (b !== a) {
        if (b !== undefined) lines.push({ text: `- ${b}`, cls: "ace-line--removed" });
        if (a !== undefined) lines.push({ text: `+ ${a}`, cls: "ace-line--added" });
      } else if (a !== undefined) {
        lines.push({ text: `  ${a}`, cls: "" });
      }
    }
    return html`
      <div class="ace-code-area">
        <div class="ace-diff-header">
          <span class="ace-diff-badge ace-diff-badge--${diff.status}">${diff.status}</span>
          <span class="ace-diff-path">${diff.path}</span>
          <button class="ace-icon-btn" @click=${() => navigator.clipboard.writeText(diff.after)} title="Copy">
            ${icons.copy}
          </button>
        </div>
        <pre class="ace-code-pre">${lines.map(
          (l, i) => html`<div class="ace-code-line ${l.cls}"><span class="ace-ln">${i + 1}</span><span class="ace-lc">${l.text}</span></div>`,
        )}</pre>
      </div>
    `;
  }

  if (props.activeFileContent) {
    const lines = props.activeFileContent.split("\n");
    return html`
      <div class="ace-code-area">
        <div class="ace-diff-header">
          <span class="ace-diff-path">${props.activeFile}</span>
          <button class="ace-icon-btn" @click=${() => navigator.clipboard.writeText(props.activeFileContent ?? "")} title="Copy">
            ${icons.copy}
          </button>
        </div>
        <pre class="ace-code-pre">${lines.map(
          (line, i) => html`<div class="ace-code-line"><span class="ace-ln">${i + 1}</span><span class="ace-lc">${line}</span></div>`,
        )}</pre>
      </div>
    `;
  }

  return html`
    <div class="ace-code-area ace-code-area--empty">
      <div class="ace-empty-state">
        ${icons.code}
        <h3>Ace Code</h3>
        <p>Your AI coding agent. Select a file from the sidebar or describe what you want to build below.</p>
      </div>
    </div>
  `;
}

/* ── Chat / prompt area ── */

function renderChat(props: AceCodeProps): TemplateResult {
  return html`
    <div class="ace-chat">
      ${props.chatMessages.length > 0
        ? html`
            <div class="ace-chat-messages">
              ${props.chatMessages.map(
                (msg) => html`
                  <div class="ace-msg ace-msg--${msg.role}">
                    <div class="ace-msg-bubble">
                      ${msg.files && msg.files.length > 0
                        ? html`<div class="ace-msg-files">
                            ${msg.files.map((f) => html`<span class="ace-msg-file">${icons.fileText} ${f}</span>`)}
                          </div>`
                        : nothing}
                      <div class="ace-msg-text">${msg.content}</div>
                    </div>
                    <span class="ace-msg-time">${formatTime(msg.timestamp)}</span>
                  </div>
                `,
              )}
              ${props.chatLoading
                ? html`<div class="ace-msg ace-msg--assistant">
                    <div class="ace-msg-bubble ace-msg-loading">
                      <span class="ace-dot"></span><span class="ace-dot"></span><span class="ace-dot"></span>
                    </div>
                  </div>`
                : nothing}
            </div>
          `
        : nothing}

      <div class="ace-prompt">
        <div class="ace-prompt-box">
          <button
            class="ace-prompt-attach"
            title="Attach files"
            @click=${() => {
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = true;
              input.onchange = () => {
                if (input.files && input.files.length > 0) {
                  const textarea = document.querySelector(".ace-prompt-input") as HTMLTextAreaElement | null;
                  const msg = textarea?.value?.trim() ?? "";
                  props.onSendMessage(msg || "Analyze these files", Array.from(input.files));
                  if (textarea) textarea.value = "";
                }
              };
              input.click();
            }}
          >
            ${icons.paperclip}
          </button>
          <textarea
            class="ace-prompt-input"
            placeholder="Ask Ace to write code, fix bugs, or explain files..."
            rows="1"
            ?disabled=${!props.connected}
            @input=${(e: Event) => {
              const ta = e.target as HTMLTextAreaElement;
              ta.style.height = "auto";
              ta.style.height = Math.min(ta.scrollHeight, 150) + "px";
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const ta = e.target as HTMLTextAreaElement;
                if (ta.value.trim()) {
                  props.onSendMessage(ta.value.trim());
                  ta.value = "";
                  ta.style.height = "auto";
                }
              }
            }}
          ></textarea>
          <button
            class="ace-prompt-send"
            title="Send message"
            ?disabled=${!props.connected}
            @click=${() => {
              const ta = document.querySelector(".ace-prompt-input") as HTMLTextAreaElement | null;
              if (ta && ta.value.trim()) {
                props.onSendMessage(ta.value.trim());
                ta.value = "";
                ta.style.height = "auto";
              }
            }}
          >
            ${icons.send}
          </button>
        </div>
        <div class="ace-prompt-hint">
          <span>Press Enter to send, Shift+Enter for new line</span>
          ${props.connected
            ? html`<span class="ace-status ace-status--ok">Connected</span>`
            : html`<span class="ace-status ace-status--off">Disconnected</span>`}
        </div>
      </div>
    </div>
  `;
}

/* ── Terminal drawer ── */

function renderTerminal(props: AceCodeProps): TemplateResult {
  if (props.terminalLines.length === 0) return html``;
  return html`
    <div class="ace-terminal-drawer">
      <div class="ace-terminal-drawer-header">
        <span>Terminal Output</span>
        <button class="ace-icon-btn" @click=${props.onClear}>${icons.x}</button>
      </div>
      <div class="ace-terminal-drawer-body">
        ${props.terminalLines.map(
          (line) => html`<div class="${line.startsWith("$") ? "ace-tout--cmd" : line.startsWith("ERR") ? "ace-tout--err" : "ace-tout"}">${line}</div>`,
        )}
      </div>
    </div>
  `;
}

/* ── Main export ── */

export function renderAceCode(props: AceCodeProps): TemplateResult {
  return html`
    <div class="ace-panel">
      ${renderFileSidebar(props)}
      <div class="ace-main">
        ${props.openTabs.length > 0 || props.activeFile ? renderTabBar(props) : nothing}
        ${renderCodeArea(props)}
        ${renderTerminal(props)}
        ${renderChat(props)}
      </div>
    </div>
  `;
}
