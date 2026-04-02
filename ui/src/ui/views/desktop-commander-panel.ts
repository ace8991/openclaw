import { html, nothing, type TemplateResult } from "lit";
import { icons } from "../icons.ts";

export type DcFileEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: string;
  modified?: string;
};

export type DcProcess = {
  name: string;
  pid: number;
  cpu?: string;
  memory?: string;
  status?: string;
};

export type DcSystemStats = {
  cpuPercent: number;
  ramUsed: number;
  ramTotal: number;
  diskFree: string;
  diskTotal: string;
  os: string;
};

type DcTab = "files" | "terminal" | "processes" | "system";

export type DesktopCommanderProps = {
  connected: boolean;
  activeTab: DcTab;
  currentPath: string;
  files: DcFileEntry[];
  terminalLines: string[];
  processes: DcProcess[];
  systemStats: DcSystemStats | null;
  onTabChange: (tab: DcTab) => void;
  onNavigate: (path: string) => void;
  onRunCommand: (cmd: string) => void;
  onClearTerminal: () => void;
  onKillProcess: (pid: number) => void;
  onRefresh: () => void;
};

function renderProgressBar(percent: number, label: string, detail: string): TemplateResult {
  return html`
    <div class="dc-stat-row">
      <span class="dc-stat-label">${label}</span>
      <div class="dc-progress">
        <div class="dc-progress__fill" style="width: ${Math.min(percent, 100)}%"></div>
      </div>
      <span class="dc-stat-detail">${detail}</span>
    </div>
  `;
}

function renderTabBar(active: DcTab, onTabChange: (tab: DcTab) => void): TemplateResult {
  const tabs: Array<{ id: DcTab; label: string; icon: TemplateResult }> = [
    { id: "files", label: "Files", icon: icons.folder },
    { id: "terminal", label: "Terminal", icon: icons.terminal },
    { id: "processes", label: "Processes", icon: icons.loader },
    { id: "system", label: "System", icon: icons.monitor },
  ];
  return html`
    <div class="dc-tabs">
      ${tabs.map(
        (tab) => html`
          <button
            class="dc-tab ${active === tab.id ? "dc-tab--active" : ""}"
            @click=${() => onTabChange(tab.id)}
          >
            ${tab.icon} ${tab.label}
          </button>
        `,
      )}
    </div>
  `;
}

function renderFileBrowser(props: DesktopCommanderProps): TemplateResult {
  const pathParts = props.currentPath.split(/[/\\]/).filter(Boolean);
  return html`
    <div class="dc-files">
      <div class="dc-breadcrumb">
        <button class="dc-breadcrumb__item" @click=${() => props.onNavigate("/")}>Root</button>
        ${pathParts.map((part, i) => {
          const path = pathParts.slice(0, i + 1).join("/");
          return html`
            <span class="dc-breadcrumb__sep">/</span>
            <button class="dc-breadcrumb__item" @click=${() => props.onNavigate(path)}>${part}</button>
          `;
        })}
        <button class="dc-refresh-btn" @click=${props.onRefresh} title="Refresh">${icons.loader}</button>
      </div>
      <div class="dc-file-list">
        ${props.currentPath !== "/"
          ? html`
              <button class="dc-file-item dc-file-item--dir" @click=${() => {
                const parent = pathParts.slice(0, -1).join("/") || "/";
                props.onNavigate(parent);
              }}>
                ${icons.folder} <span>..</span>
              </button>
            `
          : nothing}
        ${props.files.length === 0
          ? html`<div class="dc-empty">No files. Click refresh to load directory.</div>`
          : props.files.map(
              (f) => html`
                <button
                  class="dc-file-item ${f.type === "dir" ? "dc-file-item--dir" : ""}"
                  @click=${() => {
                    if (f.type === "dir") {
                      props.onNavigate(f.path);
                    }
                  }}
                  title="${f.path}"
                >
                  ${f.type === "dir" ? icons.folder : icons.fileText}
                  <span class="dc-file-name">${f.name}</span>
                  ${f.size ? html`<span class="dc-file-size">${f.size}</span>` : nothing}
                </button>
              `,
            )}
      </div>
    </div>
  `;
}

function renderTerminalTab(props: DesktopCommanderProps): TemplateResult {
  const quickCmds = ["dir", "ipconfig", "tasklist", "systeminfo", "Get-Process | Select -First 20"];
  return html`
    <div class="dc-terminal-panel">
      <div class="dc-quick-cmds">
        ${quickCmds.map(
          (cmd) => html`
            <button class="dc-quick-btn" @click=${() => props.onRunCommand(cmd)}>${cmd}</button>
          `,
        )}
      </div>
      <div class="dc-terminal">
        ${props.terminalLines.length === 0
          ? html`<div class="dc-term-hint">Run commands via the AI agent. Output appears here.</div>`
          : props.terminalLines.map(
              (line) => html`
                <div class="${line.startsWith("$") ? "dc-terminal__prompt" : line.startsWith("ERR") ? "dc-terminal__error" : "dc-terminal__output"}">${line}</div>
              `,
            )}
      </div>
      <div class="dc-terminal-input">
        <span class="dc-prompt-sign">PS&gt;</span>
        <input
          type="text"
          placeholder="Enter command..."
          ?disabled=${!props.connected}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              const input = e.target as HTMLInputElement;
              if (input.value.trim()) {
                props.onRunCommand(input.value.trim());
                input.value = "";
              }
            }
          }}
        />
        <button class="dc-clear-btn" @click=${props.onClearTerminal}>${icons.x}</button>
      </div>
    </div>
  `;
}

function renderProcesses(props: DesktopCommanderProps): TemplateResult {
  return html`
    <div class="dc-processes">
      <div class="dc-processes-header">
        <span>${props.processes.length} processes</span>
        <button class="dc-refresh-btn" @click=${props.onRefresh}>${icons.loader} Refresh</button>
      </div>
      ${props.processes.length === 0
        ? html`<div class="dc-empty">No process data. Click Refresh to load.</div>`
        : html`
            <div class="dc-process-table">
              <div class="dc-process-row dc-process-row--header">
                <span>Name</span><span>PID</span><span>Memory</span><span></span>
              </div>
              ${props.processes.map(
                (p) => html`
                  <div class="dc-process-row">
                    <span class="dc-process-name">${p.name}</span>
                    <span class="dc-process-pid">${p.pid}</span>
                    <span class="dc-process-mem">${p.memory ?? "-"}</span>
                    <button
                      class="dc-kill-btn"
                      @click=${() => {
                        if (confirm(`Kill ${p.name} (PID ${p.pid})?`)) {
                          props.onKillProcess(p.pid);
                        }
                      }}
                    >
                      Kill
                    </button>
                  </div>
                `,
              )}
            </div>
          `}
    </div>
  `;
}

function renderSystemStats(props: DesktopCommanderProps): TemplateResult {
  const stats = props.systemStats;
  if (!stats) {
    return html`
      <div class="dc-system">
        <div class="dc-empty">
          <p>No system data loaded.</p>
          <button class="dc-refresh-btn" @click=${props.onRefresh}>${icons.loader} Load System Info</button>
        </div>
      </div>
    `;
  }
  const ramPercent = stats.ramTotal > 0 ? (stats.ramUsed / stats.ramTotal) * 100 : 0;
  return html`
    <div class="dc-system">
      <div class="dc-system-os">${stats.os}</div>
      ${renderProgressBar(stats.cpuPercent, "CPU", `${stats.cpuPercent.toFixed(0)}%`)}
      ${renderProgressBar(ramPercent, "RAM", `${(stats.ramUsed / 1024).toFixed(1)} / ${(stats.ramTotal / 1024).toFixed(1)} GB`)}
      <div class="dc-stat-row">
        <span class="dc-stat-label">Disk</span>
        <span class="dc-stat-detail">${stats.diskFree} free / ${stats.diskTotal}</span>
      </div>
      <button class="dc-refresh-btn dc-refresh-system" @click=${props.onRefresh}>${icons.loader} Refresh</button>
    </div>
  `;
}

export function renderDesktopCommander(props: DesktopCommanderProps): TemplateResult {
  return html`
    <div class="dc-panel">
      <div class="dc-topbar">
        <span class="dc-title">${icons.desktop} Desktop Commander</span>
      </div>
      ${renderTabBar(props.activeTab, props.onTabChange)}
      <div class="dc-content">
        ${props.activeTab === "files" ? renderFileBrowser(props) : nothing}
        ${props.activeTab === "terminal" ? renderTerminalTab(props) : nothing}
        ${props.activeTab === "processes" ? renderProcesses(props) : nothing}
        ${props.activeTab === "system" ? renderSystemStats(props) : nothing}
      </div>
    </div>
  `;
}
