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
  onCreateProject: () => void;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onUpdateProject: (project: Project) => void;
  onOpenInChat: (projectId: string) => void;
};

const PROJECT_COLORS = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#e67e22", "#16a085"];

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function renderProjectCard(project: Project, props: CoWorkProps): TemplateResult {
  const isActive = project.id === props.activeProjectId;
  return html`
    <div
      class="cowork-card ${isActive ? "cowork-card--active" : ""}"
      style="--project-color: ${project.color || "#c0392b"}"
      @click=${() => props.onSelectProject(project.id)}
    >
      <div class="cowork-card__header">
        <span class="cowork-card__name">${project.name}</span>
        <button
          class="cowork-card__menu"
          @click=${(e: Event) => {
            e.stopPropagation();
            if (confirm(`Delete project "${project.name}"?`)) {
              props.onDeleteProject(project.id);
            }
          }}
          title="Delete project"
        >
          ${icons.x}
        </button>
      </div>
      ${project.description
        ? html`<p class="cowork-card__desc">${project.description}</p>`
        : nothing}
      <div class="cowork-card__meta">
        <span>${project.sessionKeys.length} sessions</span>
        <span>${project.files.length} files</span>
      </div>
      <div class="cowork-card__footer">
        <span class="cowork-card__time">Updated ${formatRelative(project.updatedAt)}</span>
        <button
          class="cowork-card__open"
          @click=${(e: Event) => {
            e.stopPropagation();
            props.onOpenInChat(project.id);
          }}
        >
          Open in Chat
        </button>
      </div>
    </div>
  `;
}

function renderActiveProject(props: CoWorkProps): TemplateResult {
  const project = props.projects.find((p) => p.id === props.activeProjectId);
  if (!project) {
    return html`<div class="cowork-detail-empty">Select a project to view details.</div>`;
  }
  return html`
    <div class="cowork-detail">
      <div class="cowork-detail__header">
        <h3 style="--project-color: ${project.color || "#c0392b"}">${project.name}</h3>
        <button class="cowork-open-chat-btn" @click=${() => props.onOpenInChat(project.id)}>
          ${icons.messageSquare} Open in Chat
        </button>
      </div>
      <div class="cowork-detail__body">
        <div class="cowork-detail__files">
          <div class="cowork-section-label">Project Files (${project.files.length})</div>
          ${project.files.length === 0
            ? html`<div class="cowork-empty-hint">No files added yet.</div>`
            : project.files.map(
                (f) => html`
                  <div class="cowork-file-item">
                    ${icons.fileText}
                    <span>${f.name}</span>
                    <span class="cowork-file-size">${(f.size / 1024).toFixed(1)}KB</span>
                  </div>
                `,
              )}
        </div>
        <div class="cowork-detail__instructions">
          <div class="cowork-section-label">Project Instructions</div>
          <textarea
            class="cowork-instructions-textarea"
            placeholder="System prompt injected into all sessions in this project..."
            .value=${project.instructions}
            @change=${(e: Event) => {
              const next = { ...project, instructions: (e.target as HTMLTextAreaElement).value, updatedAt: Date.now() };
              props.onUpdateProject(next);
            }}
          ></textarea>
        </div>
      </div>
    </div>
  `;
}

export function renderCoWork(props: CoWorkProps): TemplateResult {
  return html`
    <div class="cowork-panel">
      <div class="cowork-topbar">
        <span class="cowork-title">${icons.folder} CoWork</span>
        <button class="cowork-new-btn" @click=${props.onCreateProject}>
          ${icons.plus} New Project
        </button>
      </div>
      <div class="cowork-grid">
        ${props.projects.map((p) => renderProjectCard(p, props))}
        ${props.projects.length === 0
          ? html`
              <button class="cowork-empty-card" @click=${props.onCreateProject}>
                ${icons.plus}
                <span>Create your first project</span>
                <span class="cowork-empty-hint">Organize work into projects with shared context and instructions.</span>
              </button>
            `
          : nothing}
      </div>
      ${props.activeProjectId ? renderActiveProject(props) : nothing}
    </div>
  `;
}
