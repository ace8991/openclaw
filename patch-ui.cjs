
// ─── PATCH: Add Claude.ai Code sidebar + CoWork sidebar ──────────────────────
// Run: node patch-ui.cjs
const fs = require('fs');

// ── 1. ACE-CODE: Add props for sidebar sessions + update renderAceCode ────────
const acePath = "C:\\Users\\User\\clawdbot\\ui\\src\\ui\\views\\ace-code.ts";
let ace = fs.readFileSync(acePath, 'utf8');

// Add new props BEFORE existing onCreatePR line
const OLD_PROPS = `  onToggleAutoAccept?: () => void;
  onCreatePR?: () => void;
};`;
const NEW_PROPS = `  onToggleAutoAccept?: () => void;
  onCreatePR?: () => void;
  // Sidebar props
  sessions?: Array<{ key: string; label?: string; preview?: string; updatedAt?: number }>;
  currentSessionKey?: string;
  assistantName?: string;
  currentModel?: string;
  onNewSession?: () => void;
  onSwitchSession?: (key: string) => void;
};`;
if (ace.includes(OLD_PROPS)) {
  ace = ace.replace(OLD_PROPS, NEW_PROPS);
  console.log('ace-code props: OK');
} else { console.log('ace-code props: SKIP (already patched)'); }

// Add renderCodeSidebar function + renderCoWorkSidebar BEFORE renderAceCode
const OLD_RENDER = `export function renderAceCode(props: AceCodeProps): TemplateResult {`;
const NEW_SIDEBAR = `// ─── Code Page Sidebar (Claude.ai style) ─────────────────────────────────────
function renderCodeSidebar(props: AceCodeProps): TemplateResult {
  const sessions = (props.sessions ?? [])
    .filter((s) => !s.key.startsWith("heartbeat") && !s.key.startsWith("cron:"))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 12);

  return html\`
    <aside class="cla-sidebar">
      <!-- Fixed actions -->
      <nav class="cla-nav">
        <button class="cla-nav-item cla-nav-item--primary" @click=\${props.onNewSession}>
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" stroke-width="1.4"/><path d="M7.5 4.5v6M4.5 7.5h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <span>Nouvelle session</span>
        </button>
        <button class="cla-nav-item">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.4"/><path d="M10 10L13.5 13.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          <span>Rechercher</span>
        </button>
        <button class="cla-nav-item">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.4"/><path d="M7.5 4v3.5l2.5 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          <span>Programmé</span>
        </button>
        <button class="cla-nav-item">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M13.5 1.5L1 6.5l5 2.5L8.5 14l5-12.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
          <span>Dispatch</span>
        </button>
      </nav>

      <div class="cla-separator"></div>

      <button class="cla-nav-item">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M2 13c0-2.8 2.5-4.5 5.5-4.5S13 10.2 13 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        <span>Personnaliser</span>
      </button>

      <!-- Projects section -->
      <div class="cla-section-header">
        <span>Tous les projets</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4.5L6 8l4-3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
      </div>

      <!-- History -->
      \${sessions.length > 0 ? html\`
        <div class="cla-section-label">Aujourd'hui</div>
        \${sessions.map((s) => {
          const isActive = s.key === (props.currentSessionKey ?? "");
          const label = s.label?.trim() || s.preview?.trim()?.slice(0, 38) || s.key.replace("agent:main:", "").slice(0, 28) || "Nouvelle session";
          return html\`
            <button
              class="cla-history-item \${isActive ? "cla-history-item--active" : ""}"
              @click=\${() => props.onSwitchSession?.(s.key)}
              title=\${label}
            >
              <span class="cla-dot"></span>
              <span class="cla-history-label">\${label}</span>
              \${isActive ? html\`<svg class="cla-cloud" width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 9A2.5 2.5 0 013.5 4.2a3 3 0 016 .5A2 2 0 019 9H2.5z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>\` : nothing}
            </button>
          \`;
        })}
      \` : nothing}

      <!-- User profile -->
      <div class="cla-user">
        <div class="cla-avatar">CE</div>
        <div class="cla-user-info">
          <span class="cla-user-name">Carl Enockson Alexis</span>
          <span class="cla-user-plan">Forfait Pro</span>
        </div>
        <div class="cla-user-btns">
          <button class="cla-user-btn" title="Télécharger">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v9M4 7l3 3 3-3M2 12h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="cla-user-btn" title="Plus">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 9l5-5 5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
    </aside>
  \`;
}

export function renderAceCode(props: AceCodeProps): TemplateResult {`;

if (!ace.includes('cla-sidebar')) {
  ace = ace.replace(OLD_RENDER, NEW_SIDEBAR);
  console.log('ace-code sidebar function: OK');
} else { console.log('ace-code sidebar: SKIP'); }

// Update renderAceCode body to use new layout with sidebar
const OLD_BODY = `export function renderAceCode(props: AceCodeProps): TemplateResult {
  return html\`
    <div class="ace-panel">
      \${renderWorkspaceHeader(props)}
      <div class="ace-workspace">
        \${renderFileSidebar(props)}
        <div class="ace-main">
          \${props.error ? html\`<div class="ace-inline-error">\${props.error}</div>\` : nothing}
          \${renderTabBar(props)}
          \${renderFileContent(props)}
          \${renderTerminal(props)}
          \${renderAceComposerBar(props)}
        </div>
      </div>
    </div>
  \`;
}`;

const NEW_BODY = `export function renderAceCode(props: AceCodeProps): TemplateResult {
  return html\`
    <div class="cla-page-layout">
      \${renderCodeSidebar(props)}
      <div class="ace-panel">
        \${renderWorkspaceHeader(props)}
        <div class="ace-workspace">
          \${renderFileSidebar(props)}
          <div class="ace-main">
            \${props.error ? html\`<div class="ace-inline-error">\${props.error}</div>\` : nothing}
            \${renderTabBar(props)}
            \${renderFileContent(props)}
            \${renderTerminal(props)}
            \${renderAceComposerBar(props)}
          </div>
        </div>
      </div>
    </div>
  \`;
}`;

if (ace.includes(OLD_BODY)) {
  ace = ace.replace(OLD_BODY, NEW_BODY);
  console.log('ace-code body: OK');
} else { console.log('ace-code body: SKIP (already patched or different)'); }

fs.writeFileSync(acePath, ace, 'utf8');
console.log('ace-code.ts written');

// ── 2. COWORK: Add CoWork sidebar + update renderCoWork layout ─────────────────
const cwPath = "C:\\Users\\User\\clawdbot\\ui\\src\\ui\\views\\cowork.ts";
let cw = fs.readFileSync(cwPath, 'utf8');

// Add CoWorkSidebar function before renderCoWork
const OLD_CW = `export function renderCoWork(props: CoWorkProps): TemplateResult {`;
const NEW_CW_SIDEBAR = `// ─── CoWork Sidebar (unique, different from Code sidebar) ────────────────────
function renderCoWorkSidebar(): TemplateResult {
  return html\`
    <aside class="cla-sidebar cla-sidebar--cowork">
      <nav class="cla-nav">
        <button class="cla-nav-item cla-nav-item--primary">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" stroke-width="1.4"/><path d="M7.5 4.5v6M4.5 7.5h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <span>Nouvelle tâche.</span>
          <span class="cla-shortcut">Ctrl+⇧+O</span>
        </button>
        <button class="cla-nav-item">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.4"/><path d="M10 10L13.5 13.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          <span>Rechercher</span>
        </button>
        <button class="cla-nav-item">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.4"/><path d="M7.5 4v3.5l2.5 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          <span>Programmé</span>
        </button>
        <button class="cla-nav-item">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1.5" y="4.5" width="12" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M5 4.5v-1a2 2 0 014 0v1" stroke="currentColor" stroke-width="1.4"/></svg>
          <span>Projets</span>
        </button>
        <button class="cla-nav-item">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M13.5 1.5L1 6.5l5 2.5L8.5 14l5-12.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
          <span>Dispatch</span>
        </button>
        <button class="cla-nav-item">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1l1.5 4H13l-3.5 2.5 1.3 4L7.5 9 4.2 11.5l1.3-4L2 5h4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          <span>Idées</span>
        </button>
      </nav>

      <div class="cla-separator"></div>

      <button class="cla-nav-item">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M2 13c0-2.8 2.5-4.5 5.5-4.5S13 10.2 13 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        <span>Personnaliser</span>
      </button>

      <div class="cla-section-label">Récents</div>
      <div class="cla-empty-history">Aucune session pour le moment</div>

      <!-- User profile -->
      <div class="cla-user">
        <div class="cla-avatar">CE</div>
        <div class="cla-user-info">
          <span class="cla-user-name">Carl Enockson Alexis</span>
          <span class="cla-user-plan">Forfait Pro</span>
        </div>
        <div class="cla-user-btns">
          <button class="cla-user-btn" title="Télécharger">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v9M4 7l3 3 3-3M2 12h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="cla-user-btn" title="Plus">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 9l5-5 5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
    </aside>
  \`;
}

export function renderCoWork(props: CoWorkProps): TemplateResult {`;

if (!cw.includes('cla-sidebar--cowork')) {
  cw = cw.replace(OLD_CW, NEW_CW_SIDEBAR);
  console.log('cowork sidebar: OK');
} else { console.log('cowork sidebar: SKIP'); }

// Wrap renderCoWork body with sidebar layout
const OLD_CW_RETURN = `  const active = props.projects.find((p) => p.id === props.activeProjectId);

  return html\`
    <div class="cw-page">`;

const NEW_CW_RETURN = `  const active = props.projects.find((p) => p.id === props.activeProjectId);

  return html\`
    <div class="cla-page-layout">
      \${renderCoWorkSidebar()}
      <div class="cw-page">`;

if (cw.includes(OLD_CW_RETURN)) {
  // Find the closing tag of cw-page and wrap it
  cw = cw.replace(OLD_CW_RETURN, NEW_CW_RETURN);
  // Now find the last </div> before the template literal end
  const oldEnd = `    </div>
  \`;
}`;
  const newEnd = `    </div>
    </div>
  \`;
}`;
  if (cw.endsWith(oldEnd) || cw.includes(oldEnd)) {
    // Replace the LAST occurrence
    const lastIdx = cw.lastIndexOf(oldEnd);
    if (lastIdx >= 0) {
      cw = cw.slice(0, lastIdx) + newEnd;
      console.log('cowork wrapper: OK');
    }
  }
} else { console.log('cowork wrapper: SKIP'); }

fs.writeFileSync(cwPath, cw, 'utf8');
console.log('cowork.ts written');
console.log('PATCH DONE');
