import { html, nothing, type TemplateResult } from "lit";
import { icons } from "../icons.ts";

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  modified?: boolean;
};

export type FileDiff = {
  path: string;
  before: string;
  after: string;
  status: "added" | "modified" | "deleted";
};

export type AceCodeProps = {
  workspacePath: string;
  files: FileEntry[];
  diffs: FileDiff[];
  terminalLines: string[];
  activeFile: string | null;
  activeFileContent: string | null;
  onFileSelect: (path: string) => void;
  onRunCommand: (cmd: string) => void;
  onClear: () => void;
  onRefreshFiles: () => void;
  connected: boolean;
};

function renderFileTree(files: FileEntry[], props: AceCodeProps): TemplateResult {
  if (files.length === 0) {
    return html`<div class="ace-empty">No files loaded. Click refresh.</div>`;
  }
  return html`
    <div class="ace-file-list">
      ${files.map(
        (f) => html`
          <button
            class="ace-file-item ${f.path === props.activeFile ? "ace-file-item--active" : ""} ${f.modified ? "ace-file-item--modified" : ""}"
            @click=${() => props.onFileSelect(f.path)}
          >
            <span class="ace-file-icon">${f.type === "dir" ? icons.folder : icons.fileText}</span>
            <span class="ace-file-name">${f.name}</span>
          </button>
        `,
      )}
    </div>
  `;
}

function renderCodeViewer(props: AceCodeProps): TemplateResult {
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
        if (b !== undefined) {
          lines.push({ text: `- ${b}`, cls: "ace-diff-removed" });
        }
        if (a !== undefined) {
          lines.push({ text: `+ ${a}`, cls: "ace-diff-added" });
        }
      } else if (a !== undefined) {
        lines.push({ text: `  ${a}`, cls: "ace-diff-unchanged" });
      }
    }
    return html`
      <div class="ace-code-viewer">
        <div class="ace-code-header">
          <span class="ace-code-filename">${props.activeFile}</span>
          <span class="ace-diff-badge">${diff.status}</span>
        </div>
        <pre class="ace-code-content">${lines.map(
          (l, i) =>
            html`<div class="${l.cls}"><span class="ace-line-num">${i + 1}</span>${l.text}</div>`,
        )}</pre>
      </div>
    `;
  }

  if (props.activeFileContent) {
    const contentLines = props.activeFileContent.split("\n");
    return html`
      <div class="ace-code-viewer">
        <div class="ace-code-header">
          <span class="ace-code-filename">${props.activeFile}</span>
          <button
            class="ace-copy-btn"
            @click=${() => navigator.clipboard.writeText(props.activeFileContent ?? "")}
          >
            ${icons.copy} Copy
          </button>
        </div>
        <pre class="ace-code-content">${contentLines.map(
          (line, i) =>
            html`<div class="ace-diff-unchanged"><span class="ace-line-num">${i + 1}</span>${line}</div>`,
        )}</pre>
      </div>
    `;
  }

  return html`
    <div class="ace-code-viewer ace-code-viewer--empty">
      <div class="ace-empty-state">
        ${icons.code}
        <p>Select a file to view its contents</p>
      </div>
    </div>
  `;
}

function renderTerminal(props: AceCodeProps): TemplateResult {
  let cmdInput = "";
  return html`
    <div class="ace-terminal">
      <div class="ace-terminal-header">
        <span>Terminal</span>
        <button class="ace-term-btn" @click=${props.onClear}>${icons.x} Clear</button>
      </div>
      <div class="ace-terminal-output">
        ${props.terminalLines.length === 0
          ? html`<div class="ace-term-hint">Type a command below to execute via the AI agent...</div>`
          : props.terminalLines.map(
              (line) => html`
                <div class="${line.startsWith("$") ? "ace-term-cmd" : line.startsWith("ERR") ? "ace-term-error" : "ace-term-output"}">
                  ${line}
                </div>
              `,
            )}
      </div>
      <div class="ace-terminal-input">
        <span class="ace-term-prompt">$</span>
        <input
          type="text"
          placeholder="Enter command..."
          ?disabled=${!props.connected}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              const input = e.target as HTMLInputElement;
              if (input.value.trim()) {
                props.onRunCommand(input.value.trim());
                cmdInput = "";
                input.value = "";
              }
            }
          }}
          @input=${(e: Event) => {
            cmdInput = (e.target as HTMLInputElement).value;
          }}
          .value=${cmdInput}
        />
      </div>
    </div>
  `;
}

export function renderAceCode(props: AceCodeProps): TemplateResult {
  return html`
    <div class="ace-code-panel">
      <div class="ace-code-topbar">
        <span class="ace-code-title">${icons.code} Ace Code</span>
        <span class="ace-code-path">${props.workspacePath}</span>
        <button class="ace-refresh-btn" @click=${props.onRefreshFiles} title="Refresh files">
          ${icons.loader}
        </button>
      </div>
      <div class="ace-code-body">
        <aside class="ace-sidebar">
          <div class="ace-sidebar-header">Files</div>
          ${renderFileTree(props.files, props)}
        </aside>
        <div class="ace-main">
          ${renderCodeViewer(props)}
        </div>
      </div>
      ${renderTerminal(props)}
    </div>
  `;
}
