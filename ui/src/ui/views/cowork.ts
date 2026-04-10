import { html, nothing, type TemplateResult } from "lit";

export type ProjectFile = {
  name: string;
  content: string;
  mimeType: string;
  size: number;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  files: ProjectFile[];
  sessionKeys: string[];
  createdAt: number;
  updatedAt: number;
  color: string;
};

export type CoWorkProps = {
  projects: Project[];
  activeProjectId: string | null;
  connected: boolean;
  loading?: boolean;
  error?: string | null;
  projectsPath?: string | null;
  onCreateProject: () => void;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onUpdateProject: (project: Project) => void;
  onAddFiles: (projectId: string, files: File[]) => void;
  onRemoveFile: (projectId: string, fileName: string) => void;
  onOpenInChat: (projectId: string) => void;
};

// ─── CoWork Sidebar ────────────────────────────────────────────────────────────
function renderCoWorkSidebar(): TemplateResult {
  return html`
    <aside class="cw-sidebar">
      <nav class="cw-sidebar__nav">

        <button class="cw-sidebar__item cw-sidebar__item--primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span>Nouvelle tâche.</span>
          <span class="cw-sidebar__shortcut">Ctrl+⇧+O</span>
        </button>

        <button class="cw-sidebar__item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
          <span>Rechercher</span>
        </button>

        <button class="cw-sidebar__item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>
          <span>Programmé</span>
        </button>

        <button class="cw-sidebar__item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
          <span>Projets</span>
        </button>

        <button class="cw-sidebar__item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          <span>Dispatch</span>
        </button>

        <button class="cw-sidebar__item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
          <span>Idées</span>
        </button>

      </nav>

      <div class="cw-sidebar__sep"></div>

      <button class="cw-sidebar__item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        <span>Personnaliser</span>
      </button>

      <div class="cw-sidebar__section-label">Récents</div>
      <div class="cw-sidebar__empty">Aucune session pour le moment</div>

      <!-- User profile -->
      <div class="cw-sidebar__user">
        <div class="cw-sidebar__avatar">CE</div>
        <div class="cw-sidebar__user-info">
          <span class="cw-sidebar__user-name">Carl Enockson Alexis</span>
          <span class="cw-sidebar__user-plan">Forfait Pro</span>
        </div>
        <div class="cw-sidebar__user-btns">
          <button class="cw-sidebar__user-btn" title="Télécharger">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>
          </button>
          <button class="cw-sidebar__user-btn" title="Haut">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
        </div>
      </div>
    </aside>
  `;
}

// ─── Demo file cards (from workspace) ─────────────────────────────────────────
const DEMO_FILE_PATHS = [
  "C:\\Users\\User\\AppData\\Roaming\\Claude\\Claude Extensions\\ant...",
  "C:\\Users\\User\\AppData\\Roaming\\Claude\\Claude Extensions\\ant...",
  "C:\\Users\\User\\AppData\\Roaming\\Claude\\Claude Extensions\\ant...",
  "C:\\Users\\User\\AppData\\Roaming\\Claude\\Claude Extensions\\ant...",
  "C:\\Users\\User\\AppData\\Roaming\\Claude\\Claude Extensions\\ant...",
];

// ─── Main CoWork content (Claude.ai hero layout) ──────────────────────────────
function renderCoWorkHero(props: CoWorkProps): TemplateResult {
  // Collect file paths to display
  const allFiles = props.projects.flatMap((p) =>
    p.files.map((f) => ({ name: f.name, lang: (f.name.split(".").pop() ?? "").toUpperCase().slice(0, 3) || "JS" }))
  );
  const displayFiles = allFiles.length > 0 ? allFiles.slice(0, 6) : DEMO_FILE_PATHS.map((p) => ({ name: p, lang: "JS" }));

  // Discovery checklist state
  const hasProjects = props.projects.length > 0;
  const hasFiles = props.projects.some((p) => p.files.length > 0);

  return html`
    <div class="cowork-main">

      <!-- Hero -->
      <div class="cowork-hero">
        <div class="cowork-logo">
          <span class="cowork-star">✳</span>
          <h1 class="cowork-title">Accomplissons une tâche de votre liste</h1>
        </div>
        <p class="cowork-subtitle">
          Cowork est en aperçu de recherche.
          <a class="cowork-subtitle__link" href="#">Découvrez comment l'utiliser en toute sécurité.</a>
        </p>
      </div>

      <!-- Files strip -->
      <div class="cowork-files-strip">
        ${displayFiles.map((f) => html`
          <div class="cowork-file-card">
            <div class="cowork-file-path">${f.name}</div>
            <span class="cowork-file-badge">${f.lang}</span>
          </div>
        `)}
      </div>

      <!-- Input box -->
      <div class="cowork-input-box">
        <input
          class="cowork-input"
          type="text"
          placeholder="Tapez / pour les compétences"
        />
        <div class="cowork-input-footer">
          <div class="cowork-footer-left">
            <button class="cowork-project-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
              <span>Travailler dans un projet</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button class="cowork-add-btn" title="Ajouter">+</button>
          </div>
          <div class="cowork-footer-right">
            <button class="cowork-model-btn">
              Sonnet 4.6
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button class="cowork-go-btn" @click=${props.onCreateProject}>
              C'est parti. →
            </button>
          </div>
        </div>
      </div>

      <!-- Discovery checklist -->
      <div class="cowork-discover">
        <h2 class="cowork-discover__title">Découvrez Cowork.</h2>

        <div class="cowork-check-item">
          <div class="cowork-check-circle cowork-check-circle--done">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="cowork-check-text">
            <div class="cowork-check-label cowork-check-label--done">Télécharger Cowork</div>
            <div class="cowork-check-desc">Bienvenue !</div>
          </div>
        </div>

        <div class="cowork-check-item">
          <div class="cowork-check-circle cowork-check-circle--done">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="cowork-check-text">
            <div class="cowork-check-label cowork-check-label--done">Connectez vos outils quotidiens</div>
            <div class="cowork-check-desc">Plus Claude connaît votre configuration, plus il peut en faire</div>
          </div>
        </div>

        <div class="cowork-check-item">
          <div class="cowork-check-circle ${hasProjects ? "cowork-check-circle--done" : ""}">
            ${hasProjects ? html`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>` : nothing}
          </div>
          <div class="cowork-check-text">
            <div class="cowork-check-label ${hasProjects ? "cowork-check-label--done" : "cowork-check-label--pending"}">Demandez à Claude de créer quelque chose.</div>
            <div class="cowork-check-desc">Essayez un tableur, un document ou une présentation</div>
          </div>
        </div>

        <div class="cowork-check-item">
          <div class="cowork-check-circle ${hasFiles ? "cowork-check-circle--done" : ""}">
            ${hasFiles ? html`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>` : nothing}
          </div>
          <div class="cowork-check-text">
            <div class="cowork-check-label ${hasFiles ? "cowork-check-label--done" : "cowork-check-label--pending"}">Planifier une tâche récurrente</div>
            <div class="cowork-check-desc">Idéal pour les rappels, rapports ou suivis réguliers</div>
          </div>
        </div>

      </div>
    </div>
  `;
}

export function renderCoWork(props: CoWorkProps): TemplateResult {
  return html`
    <div class="cla-page-layout">
      ${renderCoWorkSidebar()}
      ${renderCoWorkHero(props)}
    </div>
  `;
}
