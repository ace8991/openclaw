
// patch-wire.cjs — Wire aceCode + coWork lazy loaders and props into app-render.ts
const fs = require('fs');
const path = "C:\\Users\\User\\clawdbot\\ui\\src\\ui\\app-render.ts";
let content = fs.readFileSync(path, 'utf8');

// ── 1. Import ace-code controllers if not there ─────────────────────────────
if (!content.includes('loadAceCode')) {
  const OLD_IMP = `import { loadChannels } from "./controllers/channels.ts";`;
  const NEW_IMP = `import { loadChannels } from "./controllers/channels.ts";
import {
  clearAceCodeTerminal,
  closeAceCodeTab,
  loadAceCode,
  openAceCodeFile,
  runAceCodeCommand,
  sendAceCodeMessage,
  toggleAceCodeSidebar,
} from "./controllers/ace-code.ts";
import {
  addFilesToCoWorkProject,
  createCoWorkProject,
  deleteCoWorkProject,
  openCoWorkProjectInChat,
  removeFileFromCoWorkProject,
  selectCoWorkProject,
  updateCoWorkProject,
  loadCoWorkProjects,
} from "./controllers/cowork.ts";`;
  content = content.replace(OLD_IMP, NEW_IMP);
  console.log('imports: OK');
} else { console.log('imports: SKIP'); }

// ── 2. Add lazy loaders for aceCode + coWork ────────────────────────────────
if (!content.includes('lazyAceCode')) {
  const OLD_LAZY = `const lazyAgents = createLazy(() => import("./views/agents.ts"));`;
  const NEW_LAZY = `const lazyAceCode = createLazy(() => import("./views/ace-code.ts"));
const lazyCoWork = createLazy(() => import("./views/cowork.ts"));
const lazyAgents = createLazy(() => import("./views/agents.ts"));`;
  content = content.replace(OLD_LAZY, NEW_LAZY);
  console.log('lazy loaders: OK');
} else { console.log('lazy loaders: SKIP'); }

// ── 3. Add aceCode + coWork state vars (after isAceCode) ────────────────────
// Find isAceCode definition
if (!content.includes('isCoWork')) {
  const OLD_IS = `const isAceCode = state.tab === "aceCode";`;
  // This may not exist — find something nearby
  const ALT = `const isChat = state.tab === "chat";`;
  if (content.includes(OLD_IS)) {
    content = content.replace(OLD_IS, `${OLD_IS}\n  const isCoWork = state.tab === "coWork";`);
    console.log('isCoWork: OK');
  } else if (content.includes(ALT)) {
    content = content.replace(ALT, `${ALT}\n  const isAceCode = state.tab === "aceCode";\n  const isCoWork = state.tab === "coWork";`);
    console.log('isAceCode+isCoWork: OK');
  } else { console.log('isCoWork: SKIP (var not found)'); }
} else { console.log('isCoWork: SKIP'); }

// ── 4. Add aceCode + coWork render blocks before closing </main> ─────────────
if (!content.includes('lazyRender(lazyAceCode')) {
  // Find the closing main tag sequence
  const OLD_MAIN_END = `      </main>
      \${renderExecApprovalPrompt(state)}`;
  const ACECODE_BLOCK = `
        \${
          state.tab === "aceCode"
            ? lazyRender(lazyAceCode, (m) =>
                m.renderAceCode({
                  workspacePath: state.aceCodeWorkspacePath,
                  files: state.aceCodeFiles,
                  diffs: state.aceCodeDiffs,
                  terminalLines: state.aceCodeTerminalLines,
                  activeFile: state.aceCodeActiveFile,
                  activeFileContent: state.aceCodeActiveFileContent,
                  openTabs: state.aceCodeOpenTabs,
                  chatMessages: (state as unknown as { aceCodeChatMessages?: import("./views/ace-code.ts").ChatMessage[] }).aceCodeChatMessages ?? [],
                  chatLoading: state.chatLoading || state.chatSending,
                  connected: state.connected,
                  sidebarOpen: state.aceCodeSidebarOpen,
                  error: state.aceCodeError,
                  // Claude.ai sidebar props
                  sessions: (state.sessionsResult?.sessions ?? []).map((s) => ({
                    key: (s as unknown as { key: string }).key ?? "",
                    label: (s as unknown as { label?: string }).label,
                    preview: (s as unknown as { preview?: string }).preview,
                    updatedAt: (s as unknown as { updatedAt?: number }).updatedAt,
                  })),
                  currentSessionKey: state.sessionKey,
                  currentModel: state.chatThinkingLevel ?? "gpt-4.1",
                  onNewSession: () => {
                    state.handleSendChat("/new", { restoreDraft: false });
                    state.setTab("chat");
                  },
                  onSwitchSession: (key: string) => {
                    switchChatSession(state, key);
                    state.setTab("chat");
                  },
                  onFileSelect: (path: string) => { void openAceCodeFile(state, path); },
                  onCloseTab: (p: string) => closeAceCodeTab(state, p),
                  onRunCommand: (cmd: string) => { void runAceCodeCommand(state, cmd); },
                  onClear: () => clearAceCodeTerminal(state),
                  onRefreshFiles: () => { void loadAceCode(state); },
                  onSendMessage: (msg: string) => { void sendAceCodeMessage(state, msg); },
                  onToggleSidebar: () => toggleAceCodeSidebar(state),
                }),
              )
            : nothing
        }

        \${
          state.tab === "coWork"
            ? lazyRender(lazyCoWork, (m) =>
                m.renderCoWork({
                  projects: state.coWorkProjects,
                  activeProjectId: state.activeProjectId,
                  connected: state.connected,
                  loading: state.coWorkLoading,
                  error: state.coWorkError,
                  projectsPath: state.coWorkProjectsPath,
                  onCreateProject: () => { void createCoWorkProject(state); },
                  onSelectProject: (id: string) => selectCoWorkProject(state, id),
                  onDeleteProject: (id: string) => { void deleteCoWorkProject(state, id); },
                  onUpdateProject: (project) => { void updateCoWorkProject(state, project); },
                  onAddFiles: (projectId: string, files: File[]) => { void addFilesToCoWorkProject(state, projectId, files); },
                  onRemoveFile: (projectId: string, fileName: string) => { void removeFileFromCoWorkProject(state, projectId, fileName); },
                  onOpenInChat: (projectId: string) => { void openCoWorkProjectInChat(state, projectId); },
                }),
              )
            : nothing
        }
`;
  if (content.includes(OLD_MAIN_END)) {
    content = content.replace(OLD_MAIN_END, ACECODE_BLOCK + `      </main>\n      \${renderExecApprovalPrompt(state)}`);
    console.log('render blocks: OK');
  } else {
    // Try to find </main> differently
    const ALT_END = `      </main>`;
    const lastMainIdx = content.lastIndexOf(ALT_END);
    if (lastMainIdx >= 0) {
      content = content.slice(0, lastMainIdx) + ACECODE_BLOCK + content.slice(lastMainIdx);
      console.log('render blocks (alt): OK');
    } else { console.log('render blocks: FAIL - could not find </main>'); }
  }
} else { console.log('render blocks: SKIP'); }

fs.writeFileSync(path, content, 'utf8');
console.log('DONE - app-render.ts updated, size=' + content.length);
