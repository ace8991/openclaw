import { html, nothing, type TemplateResult } from "lit";
import { icons } from "../icons.ts";

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

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

const PROJECT_COLORS = ["#c0392b","#2980b9","#27ae60","#8e44ad","#d35400","#16a085","#f39c12","#2c3e50"];

function renderProjectGrid(props: CoWorkProps): TemplateResult {
  if (props.projects.length === 0) {
    return html`
      <div class="cw-empty">
        <div class="cw-empty__icon">
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
            <rect x="6" y="14" width="40" height="30" rx="4" stroke="currentColor" stroke-width="1.8"/>
            <path d="M6 22h40M17 8h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </div>
        <h2>Créez votre premier projet</h2>
        <p>Organisez vos conversations avec des instructions partagées et des fichiers de contexte.</p>
        <button class="cw-empty__cta" @click=${props.onCreateProject}>
          ${icons.plus} Nouveau projet
        </button>
      </div>
    `;
  }

  return html`
    <div class="cw-grid">
      ${props.projects.map((p) => renderProjectCard(p, props))}
      <button class="cw-new-card" @click=${props.onCreateProject}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M11 2v18M2 11h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <span>Nouveau projet</span>
      </button>
    </div>
  `;
}

function renderProjectCard(project: Project, props: CoWorkProps): TemplateResult {
  return html`
    <div
      class="cw-card"
      style="--pc: ${project.color || "#c0392b"}"
      @click=${() => props.onSelectProject(project.id)}
    >
      <div class="cw-card__accent"></div>
      <div class="cw-card__body">
        <div class="cw-card__top">
          <div class="cw-card__icon">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="5" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.4"/>
              <path d="M2 9h14M6 2h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          </div>
          <button
            class="cw-card__del"
            title="Supprimer"
            @click=${(e: Event) => {
              e.stopPropagation();
              if (confirm(`Supprimer "${project.name}" ?`)) props.onDeleteProject(project.id);
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 2l9 9M11 2L2 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <h3 class="cw-card__name">${project.name}</h3>
        ${project.description
          ? html`<p class="cw-card__desc">${project.description}</p>`
          : nothing}
        <div class="cw-card__stats">
          <span>${project.sessionKeys.length} session${project.sessionKeys.length !== 1 ? "s" : ""}</span>
          <span class="cw-dot">·</span>
          <span>${project.files.length} fichier${project.files.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
      <div class="cw-card__footer">
        <span class="cw-card__date">${formatRelative(project.updatedAt)}</span>
        <button
          class="cw-card__open"
          @click=${(e: Event) => { e.stopPropagation(); props.onOpenInChat(project.id); }}
        >
          Ouvrir →
        </button>
      </div>
    </div>
  `;
}

function renderProjectDetail(project: Project, props: CoWorkProps): TemplateResult {
  return html`
    <div class="cw-detail">
      <div class="cw-detail__instructions">
        <div class="cw-panel-label">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2h10v10H2V2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
            <path d="M4 5h6M4 7h4M4 9h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          Instructions du projet
        </div>
        <textarea
          class="cw-instructions-editor"
          placeholder="Ajoutez des instructions injectées dans toutes les sessions de ce projet…"
          .value=${project.instructions}
          @input=${(e: Event) => {
            props.onUpdateProject({
              ...project,
              instructions: (e.target as HTMLTextAreaElement).value,
              updatedAt: Date.now(),
            });
          }}
        ></textarea>

        <div class="cw-panel-label" style="margin-top:20px">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 1h5l3 3v9H3V1z" stroke="currentColor" stroke-width="1.3"/>
            <path d="M8 1v3h3" stroke="currentColor" stroke-width="1.3"/>
          </svg>
          Fichiers (${project.files.length})
        </div>
        <div class="cw-files-list">
          ${project.files.map(
            (f) => html`
              <div class="cw-file-row">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2.5 1h5l3 3v8h-8V1z" stroke="currentColor" stroke-width="1.2"/>
                  <path d="M7.5 1v3h3" stroke="currentColor" stroke-width="1.2"/>
                </svg>
                <span class="cw-file-row__name">${f.name}</span>
                <span class="cw-file-row__size">${(f.size / 1024).toFixed(1)}KB</span>
                <button
                  class="cw-file-row__del"
                  @click=${() => props.onRemoveFile(project.id, f.name)}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            `,
          )}
        </div>
        <button
          class="cw-add-file-btn"
          @click=${() => {
            const inp = document.createElement("input");
            inp.type = "file";
            inp.multiple = true;
            inp.onchange = () => {
              const files = Array.from(inp.files ?? []);
              if (files.length) props.onAddFiles(project.id, files);
            };
            inp.click();
          }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          Ajouter des fichiers
        </button>
      </div>

      <div class="cw-detail__sessions">
        <div class="cw-panel-label">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2h10v8H8l-3 2V10H2V2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
          </svg>
          Sessions (${project.sessionKeys.length})
        </div>
        ${project.sessionKeys.length === 0
          ? html`<p class="cw-empty-hint">Aucune session pour l'instant.</p>`
          : project.sessionKeys.map(
              (key) => html`
                <div class="cw-session-row">
                  <span class="cw-session-dot"></span>
                  <span>${key.replace("agent:main:", "").slice(0, 42)}</span>
                </div>
              `,
            )}
        <button class="cw-open-chat-btn" @click=${() => props.onOpenInChat(project.id)}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 2h9v7H7L4.5 11V9H2V2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
          </svg>
          Ouvrir dans le chat
        </button>
      </div>
    </div>
  `;
}

export function renderCoWork(props: CoWorkProps): TemplateResult {
  const active = props.projects.find((p) => p.id === props.activeProjectId);

  return html`
    <div class="cw-page">
      <div class="cw-header">
        <div class="cw-header__left">
          ${active
            ? html`
                <button class="cw-back-btn" @click=${() => props.onSelectProject("")}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                  </svg>
                </button>
                <h1 class="cw-heading" style="--pc:${active.color || "#c0392b"}">${active.name}</h1>
              `
            : html`
                <h1 class="cw-heading">Tous les projets</h1>
                ${props.projects.length > 0
                  ? html`<span class="cw-count">${props.projects.length} projet${props.projects.length !== 1 ? "s" : ""}</span>`
                  : nothing}
              `}
        </div>
        <button class="cw-new-btn" @click=${props.onCreateProject}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
          Nouveau projet
        </button>
      </div>

      ${props.error ? html`<div class="cw-error">${props.error}</div>` : nothing}

      ${props.loading
        ? html`<div class="cw-loading">Chargement…</div>`
        : active
          ? renderProjectDetail(active, props)
          : renderProjectGrid(props)}
    </div>
  `;
}
