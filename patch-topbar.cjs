
// patch-topbar.cjs — Add Chat/Cowork/Code pill tabs to topbar
// Run: node patch-topbar.cjs
const fs = require('fs');
const path = "C:\\Users\\User\\clawdbot\\ui\\src\\ui\\app-render.ts";
let content = fs.readFileSync(path, 'utf8');

// ── 1. Replace shell class: add fullscreen classes for aceCode/coWork ──────────
const OLD_SHELL = `    <div
      class="shell \${isChat ? "shell--chat" : ""} \${chatFocus ? "shell--chat-focus" : ""} \${navCollapsed ? "shell--nav-collapsed" : ""} \${navDrawerOpen ? "shell--nav-drawer-open" : ""} \${state.onboarding ? "shell--onboarding" : ""}"
    >`;

const NEW_SHELL = `    <div
      class="shell \${isChat ? "shell--chat" : ""} \${isAceCode ? "shell--fullpage" : ""} \${isCoWork ? "shell--fullpage" : ""} \${chatFocus ? "shell--chat-focus" : ""} \${navCollapsed ? "shell--nav-collapsed" : ""} \${navDrawerOpen ? "shell--nav-drawer-open" : ""} \${state.onboarding ? "shell--onboarding" : ""}"
    >`;

if (content.includes(OLD_SHELL)) {
  content = content.replace(OLD_SHELL, NEW_SHELL);
  console.log('shell class: OK');
} else { console.log('shell class: SKIP'); }

// ── 2. Add pill tabs inside topnav-shell (after menu button, before content) ──
const OLD_TOPNAV = `          <div class="topnav-shell__content">
            <dashboard-header .tab=\${state.tab}></dashboard-header>
          </div>
          <div class="topnav-shell__actions">`;

const NEW_TOPNAV = `          <div class="topnav-shell__content">
            <dashboard-header .tab=\${state.tab}></dashboard-header>
          </div>

          <!-- ── Chat / Cowork / Code pill tabs ── -->
          <div class="topbar-tab-switcher">
            <a
              class="topbar-tab \${state.tab === "chat" ? "topbar-tab--active" : ""}"
              href=\${pathForTab("chat", state.basePath)}
              @click=\${(e: MouseEvent) => { e.preventDefault(); state.setTab("chat"); }}
            >Chat</a>
            <a
              class="topbar-tab \${state.tab === "coWork" ? "topbar-tab--active" : ""}"
              href=\${pathForTab("coWork", state.basePath)}
              @click=\${(e: MouseEvent) => { e.preventDefault(); state.setTab("coWork"); }}
            >Cowork</a>
            <a
              class="topbar-tab \${state.tab === "aceCode" ? "topbar-tab--active" : ""}"
              href=\${pathForTab("aceCode", state.basePath)}
              @click=\${(e: MouseEvent) => { e.preventDefault(); state.setTab("aceCode"); }}
            >Code</a>
          </div>

          <div class="topnav-shell__actions">`;

if (content.includes(OLD_TOPNAV)) {
  content = content.replace(OLD_TOPNAV, NEW_TOPNAV);
  console.log('pill tabs: OK');
} else { console.log('pill tabs: SKIP (already patched?)'); }

// ── 3. Hide shell-nav when on aceCode or coWork (fullpage mode) ───────────────
// Find the shell-nav div and wrap it with a condition
const OLD_SHELL_NAV = `      <div class="shell-nav">
        <aside class="sidebar`;

const NEW_SHELL_NAV = `      \${!isAceCode && !isCoWork ? html\`<div class="shell-nav">
        <aside class="sidebar`;

if (content.includes(OLD_SHELL_NAV) && !content.includes('!isAceCode && !isCoWork')) {
  // Find the closing of shell-nav to wrap it properly
  // The shell-nav ends with </div>` followed by main
  const END_MARKER = `            </div>\`
      }
      <main class="content`;

  // Actually simpler: just find </aside>\n      </div>\n and add condition end
  // Let's find the specific closing pattern
  const CLOSE_SHELL_NAV = `              </aside>
            </div>`; // This won't work either

  // Best approach: just wrap with the condition
  content = content.replace(OLD_SHELL_NAV, NEW_SHELL_NAV);

  // Now find closing </div>` for shell-nav before <main
  const BEFORE_MAIN = `      <main class="content \${isChat`;
  const OLD_BEFORE_MAIN = `      <main class="content \${isChat`;

  // Find the </div> that closes shell-nav (it appears right before <main)
  const shellNavCloseIdx = content.lastIndexOf(`            </div>\`\n      }\n      <main`);
  if (shellNavCloseIdx < 0) {
    // Try to find </div> right before <main
    const mainIdx = content.indexOf(`      <main class="content \${isChat`);
    if (mainIdx > 0) {
      // Look backwards for the last </div>
      const beforeMain = content.slice(0, mainIdx);
      const lastDivClose = beforeMain.lastIndexOf('      </div>');
      if (lastDivClose > 0) {
        content = content.slice(0, lastDivClose) + `      </div>\` : nothing}\n` + content.slice(lastDivClose + '      </div>'.length);
        console.log('shell-nav hide: OK (method B)');
      } else { console.log('shell-nav hide: FAIL - no closing div found'); }
    }
  } else { console.log('shell-nav hide: OK (method A)'); }
} else {
  console.log('shell-nav hide: SKIP (already patched or OLD_SHELL_NAV not found)');
}

fs.writeFileSync(path, content, 'utf8');
console.log('DONE - size=' + content.length);
