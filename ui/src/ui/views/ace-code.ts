import { html, nothing, type TemplateResult } from "lit";

// ─── Types ────────────────────────────────────────────────────────────────────
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
  currentModel?: string;
  autoAccept?: boolean;
  onFileSelect: (path: string) => void;
  onCloseTab: (path: string) => void;
  onRunCommand: (cmd: string) => void;
  onClear: () => void;
  onRefreshFiles: () => void;
  onSendMessage: (msg: string, files?: File[]) => void;
  onToggleSidebar: () => void;
  onToggleAutoAccept?: () => void;
  onSelectFolder?: () => void;
  // Sidebar props
  sessions?: Array<{ key: string; label?: string; preview?: string; updatedAt?: number }>;
  currentSessionKey?: string;
  onNewSession?: () => void;
  onSwitchSession?: (key: string) => void;
};

// ─── Robot pixel-art SVG (AceAgent icon, orange) ─────────────────────────────
function renderRobotIcon(): TemplateResult {
  return html`
    <svg
      width="64" height="64"
      viewBox="0 0 16 16"
      style="image-rendering:pixelated;"
      fill="#e05a2b"
      stroke="none"
    >
      <rect x="3" y="6" width="10" height="7"/>
      <rect x="4" y="2" width="8" height="5"/>
      <rect x="7" y="0" width="2" height="2"/>
      <rect x="5" y="3" width="2" height="2" fill="#1a1a1a"/>
      <rect x="9" y="3" width="2" height="2" fill="#1a1a1a"/>
      <rect x="5" y="6" width="6" height="1" fill="#1a1a1a"/>
      <rect x="4" y="13" width="3" height="3"/>
      <rect x="9" y="13" width="3" height="3"/>
      <rect x="0" y="7" width="3" height="2"/>
      <rect x="13" y="7" width="3" height="2"/>
    </svg>
  `;
}

// ─── Sidebar (Claude.ai Code style) ───────────────────────────────────────────
function renderCodeSidebar(props: AceCodeProps): TemplateResult {
  const sessions = (props.sessions ?? [])
    .filter((s) => !s.key.startsWith("heartbeat") && !s.key.startsWith("cron:"))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 15);

  // Group by today vs older
  const now = Date.now();
  const todaySessions = sessions.filter((s) => {
    const diff = now - (s.updatedAt ?? 0);
    return diff < 86400000; // 24h
  });
  const olderSessions = sessions.filter((s) => {
    const diff = now - (s.updatedAt ?? 0);
    return diff >= 86400000;
  });

  return html`
    <aside class="cla-sidebar">

      <!-- Fixed nav actions -->
      <nav class="cla-nav">
        <button class="cla-nav-item cla-nav-item--primary" @click=${props.onNewSession}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" stroke-width="1.4"/>
            <path d="M7.5 4.5v6M4.5 7.5h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
          <span>Nouvelle session</span>
        </button>

        <button class="cla-nav-item">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.4"/>
            <path d="M10 10L13.5 13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span>Rechercher</span>
        </button>

        <button class="cla-nav-item">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.4"/>
            <path d="M7.5 4v3.5l2.5 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          <span>Programmé</span>
        </button>

        <button class="cla-nav-item">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M13.5 1.5L1 6.5l5 2.5L8.5 14l5-12.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
          </svg>
          <span>Dispatch</span>
        </button>
      </nav>

      <div class="cla-separator"></div>

      <button class="cla-nav-item">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <circle cx="7.5" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4"/>
          <path d="M2 13c0-2.8 2.5-4.5 5.5-4.5S13 10.2 13 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <span>Personnaliser</span>
      </button>

      <!-- Tous les projets -->
      <div class="cla-projects-header">
        <span>Tous les projets</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4.5L6 8l4-3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
      </div>

      <!-- History -->
      <div class="cla-history-scroll">
        ${todaySessions.length > 0 ? html`
          <div class="cla-section-label">Aujourd'hui</div>
          ${todaySessions.map((s) => {
            const isActive = s.key === (props.currentSessionKey ?? "");
            const label = s.label?.trim()
              || s.preview?.trim()?.slice(0, 40)
              || s.key.replace("agent:main:", "").slice(0, 30)
              || "Nouvelle session";
            return html`
              <button
                class="cla-history-item ${isActive ? "cla-history-item--active" : ""}"
                @click=${() => props.onSwitchSession?.(s.key)}
                title=${label}
              >
                <span class="cla-dot ${isActive ? "cla-dot--on" : ""}"></span>
                <span class="cla-history-label">${label}</span>
                ${isActive ? html`
                  <svg class="cla-cloud" width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2.5 9A2.5 2.5 0 013.5 4.2a3 3 0 016 .5A2 2 0 019 9H2.5z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
                  </svg>
                ` : nothing}
              </button>
            `;
          })}
        ` : nothing}

        ${olderSessions.length > 0 ? html`
          <div class="cla-section-label">Plus ancien</div>
          ${olderSessions.map((s) => {
            const isActive = s.key === (props.currentSessionKey ?? "");
            const label = s.label?.trim()
              || s.preview?.trim()?.slice(0, 40)
              || s.key.replace("agent:main:", "").slice(0, 30)
              || "Nouvelle session";
            return html`
              <button
                class="cla-history-item ${isActive ? "cla-history-item--active" : ""}"
                @click=${() => props.onSwitchSession?.(s.key)}
                title=${label}
              >
                <span class="cla-dot ${isActive ? "cla-dot--on" : ""}"></span>
                <span class="cla-history-label">${label}</span>
              </button>
            `;
          })}
        ` : nothing}

        ${sessions.length === 0 ? html`
          <div class="cla-empty-history">Aucune session</div>
        ` : nothing}
      </div>

      <!-- User profile bottom -->
      <div class="cla-user">
        <div class="cla-avatar">CE</div>
        <div class="cla-user-info">
          <span class="cla-user-name">Carl Enockson Alexis</span>
          <span class="cla-user-plan">Forfait Pro</span>
        </div>
        <div class="cla-user-btns">
          <button class="cla-user-btn" title="Télécharger">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v9M4 7l3 3 3-3M2 12h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="cla-user-btn" title="Plus">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 9l5-5 5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  `;
}

// ─── Main Code Area ───────────────────────────────────────────────────────────
function renderCodeMain(props: AceCodeProps): TemplateResult {
  const model = props.currentModel ?? "Opus 4.6";
  let inputValue = "";

  return html`
    <div class="ace-code-main">

      <!-- Error banner if any -->
      ${props.error ? html`
        <div class="ace-code-error">${props.error}</div>
      ` : nothing}

      <!-- Center: robot icon (empty state) -->
      <div class="ace-code-center">
        ${renderRobotIcon()}
      </div>

      <!-- Bottom composer (exact match to screenshot) -->
      <div class="ace-code-bottom">

        <!-- Input box -->
        <div class="ace-code-input-box">
          <input
            class="ace-code-input"
            placeholder="Find a small todo in the codebase and do it"
            type="text"
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") {
                const val = (e.target as HTMLInputElement).value.trim();
                if (val) {
                  props.onSendMessage(val);
                  (e.target as HTMLInputElement).value = "";
                }
              }
            }}
          />

          <!-- Input footer row -->
          <div class="ace-code-input-footer">
            <div class="ace-code-footer-left">
              <!-- + button -->
              <button class="ace-code-icon-btn" title="Ajouter">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                </svg>
              </button>

              <!-- Auto-accept toggle -->
              <button
                class="ace-code-toggle-btn ${props.autoAccept ? "ace-code-toggle-btn--on" : ""}"
                @click=${props.onToggleAutoAccept}
                title="Accepter automatiquement les modifications"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 3.5h2M3 2v3M7 3.5h4M9 2v3M2 8.5h9M4 7v3M8 7v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
                <span>Accepter automatiquement les modifications</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 3.5L5 6.5l3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
              </button>
            </div>

            <div class="ace-code-footer-right">
              <!-- Model selector -->
              <button class="ace-code-model-btn">
                ${model}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 3.5L5 6.5l3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
              </button>

              <!-- Mic button -->
              <button class="ace-code-mic-btn" title="Entrée vocale">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="4.5" y="1" width="5" height="7.5" rx="2.5" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M1.5 7c0 3 2.5 5 5 5s5-2 5-5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                  <path d="M7 12v2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Bottom toolbar row (Sélectionner un dossier + Local) -->
        <div class="ace-code-toolbar">
          <button class="ace-code-folder-btn" @click=${props.onSelectFolder}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1.5 3h3.5l1 1.5h5.5v6h-10z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
            </svg>
            <span>Sélectionner un dossier</span>
          </button>

          <div class="ace-code-toolbar-spacer"></div>

          <button class="ace-code-local-btn">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="2" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
              <path d="M4 10h4M6 9v2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            <span>Local</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 3.5L5 6.5l3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

      </div>
    </div>
  `;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function renderAceCode(props: AceCodeProps): TemplateResult {
  return html`
    <div class="cla-page-layout">
      ${renderCodeSidebar(props)}
      ${renderCodeMain(props)}
    </div>
  `;
}
