import { generateUUID } from "../uuid.ts";
import type { Project, ProjectFile } from "../views/cowork.ts";

const DEFAULT_PROJECT_COLORS = [
  "#c0392b",
  "#2980b9",
  "#27ae60",
  "#8e44ad",
  "#e67e22",
  "#16a085",
];
const MAX_PROJECT_FILE_CHARS = 20_000;

type CoWorkProjectsResult = {
  path?: string;
  projects?: unknown;
};

export type CoWorkState = {
  client: { request<T = unknown>(method: string, params?: unknown): Promise<T> } | null;
  connected: boolean;
  coWorkLoading: boolean;
  coWorkError: string | null;
  coWorkProjectsPath: string | null;
  coWorkProjects: Project[];
  activeProjectId: string | null;
  sessionKey: string;
  settings: { sessionKey: string; lastActiveSessionKey: string; [key: string]: unknown };
  applySettings: (next: CoWorkState["settings"]) => void;
  setTab: (tab: import("../navigation.ts").Tab) => void;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeProjectFile(value: ProjectFile): ProjectFile {
  return {
    name: value.name.trim(),
    content: value.content,
    mimeType: value.mimeType || "text/plain",
    size: Number.isFinite(value.size) ? value.size : value.content.length,
  };
}

function sanitizeProject(value: unknown): Project | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    description: typeof record.description === "string" ? record.description : "",
    instructions: typeof record.instructions === "string" ? record.instructions : "",
    files: Array.isArray(record.files)
      ? record.files
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }
            const file = entry as Record<string, unknown>;
            const fileName = typeof file.name === "string" ? file.name.trim() : "";
            if (!fileName) {
              return null;
            }
            return sanitizeProjectFile({
              name: fileName,
              content: typeof file.content === "string" ? file.content : "",
              mimeType: typeof file.mimeType === "string" ? file.mimeType : "text/plain",
              size:
                typeof file.size === "number" && Number.isFinite(file.size)
                  ? file.size
                  : 0,
            });
          })
          .filter((entry): entry is ProjectFile => Boolean(entry))
      : [],
    sessionKeys: Array.isArray(record.sessionKeys)
      ? record.sessionKeys.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        )
      : [],
    createdAt:
      typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
        ? record.createdAt
        : Date.now(),
    updatedAt:
      typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
        ? record.updatedAt
        : Date.now(),
    color:
      typeof record.color === "string" && record.color.trim()
        ? record.color
        : DEFAULT_PROJECT_COLORS[0],
  };
}

function projectSessionKey(projectId: string): string {
  return `cowork:${projectId}`;
}

function chooseProjectColor(projects: Project[]): string {
  return DEFAULT_PROJECT_COLORS[projects.length % DEFAULT_PROJECT_COLORS.length] ?? "#c0392b";
}

async function persistProjects(state: CoWorkState) {
  if (!state.client || !state.connected) {
    return;
  }
  const payload = state.coWorkProjects.map((project) => ({
    ...project,
    files: project.files.map((file) => sanitizeProjectFile(file)),
  }));
  const result = await state.client.request<{ path?: string }>("cowork.projects.set", {
    projects: payload,
  });
  state.coWorkProjectsPath = result.path?.trim() ?? state.coWorkProjectsPath;
}

export function resolveActiveProject(state: Pick<CoWorkState, "coWorkProjects" | "activeProjectId">) {
  return state.coWorkProjects.find((project) => project.id === state.activeProjectId) ?? null;
}

export async function loadCoWorkProjects(state: CoWorkState) {
  if (!state.client || !state.connected || state.coWorkLoading) {
    return;
  }
  state.coWorkLoading = true;
  state.coWorkError = null;
  try {
    const result = await state.client.request<CoWorkProjectsResult>("cowork.projects.get", {});
    const projects = Array.isArray(result.projects)
      ? result.projects.map(sanitizeProject).filter((entry): entry is Project => Boolean(entry))
      : [];
    state.coWorkProjectsPath = result.path?.trim() ?? null;
    state.coWorkProjects = projects.sort((left, right) => right.updatedAt - left.updatedAt);
    if (state.activeProjectId && !state.coWorkProjects.some((project) => project.id === state.activeProjectId)) {
      state.activeProjectId = state.coWorkProjects[0]?.id ?? null;
    }
  } catch (error) {
    state.coWorkError = toErrorMessage(error);
  } finally {
    state.coWorkLoading = false;
  }
}

export async function createCoWorkProject(state: CoWorkState) {
  const now = Date.now();
  const name = `Project ${state.coWorkProjects.length + 1}`;
  const project: Project = {
    id: generateUUID(),
    name,
    description: "",
    instructions: "",
    files: [],
    sessionKeys: [],
    createdAt: now,
    updatedAt: now,
    color: chooseProjectColor(state.coWorkProjects),
  };
  state.coWorkProjects = [project, ...state.coWorkProjects];
  state.activeProjectId = project.id;
  try {
    await persistProjects(state);
  } catch (error) {
    state.coWorkProjects = state.coWorkProjects.filter((entry) => entry.id !== project.id);
    state.activeProjectId = state.coWorkProjects[0]?.id ?? null;
    state.coWorkError = toErrorMessage(error);
  }
}

export function selectCoWorkProject(state: CoWorkState, projectId: string) {
  state.activeProjectId = projectId;
}

export async function deleteCoWorkProject(state: CoWorkState, projectId: string) {
  const previous = [...state.coWorkProjects];
  state.coWorkProjects = state.coWorkProjects.filter((project) => project.id !== projectId);
  if (state.activeProjectId === projectId) {
    state.activeProjectId = state.coWorkProjects[0]?.id ?? null;
  }
  try {
    await persistProjects(state);
  } catch (error) {
    state.coWorkProjects = previous;
    state.coWorkError = toErrorMessage(error);
  }
}

export async function updateCoWorkProject(state: CoWorkState, project: Project) {
  const nextProject = {
    ...project,
    name: project.name.trim() || "Untitled Project",
    updatedAt: Date.now(),
    files: project.files.map((file) => sanitizeProjectFile(file)),
  };
  const previous = [...state.coWorkProjects];
  state.coWorkProjects = state.coWorkProjects.map((entry) =>
    entry.id === nextProject.id ? nextProject : entry,
  );
  try {
    await persistProjects(state);
  } catch (error) {
    state.coWorkProjects = previous;
    state.coWorkError = toErrorMessage(error);
  }
}

export async function addFilesToCoWorkProject(
  state: CoWorkState,
  projectId: string,
  files: File[],
) {
  const project = state.coWorkProjects.find((entry) => entry.id === projectId);
  if (!project || files.length === 0) {
    return;
  }
  const additions = await Promise.all(
    files.map(async (file) => {
      const content = await file.text();
      return sanitizeProjectFile({
        name: file.name,
        content,
        mimeType: file.type || "text/plain",
        size: file.size,
      });
    }),
  );
  const merged = project.files
    .filter((existing) => !additions.some((file) => file.name === existing.name))
    .concat(additions);
  await updateCoWorkProject(state, {
    ...project,
    files: merged,
  });
}

export async function removeFileFromCoWorkProject(
  state: CoWorkState,
  projectId: string,
  fileName: string,
) {
  const project = state.coWorkProjects.find((entry) => entry.id === projectId);
  if (!project) {
    return;
  }
  await updateCoWorkProject(state, {
    ...project,
    files: project.files.filter((file) => file.name !== fileName),
  });
}

export async function openCoWorkProjectInChat(state: CoWorkState, projectId: string) {
  const project = state.coWorkProjects.find((entry) => entry.id === projectId);
  if (!project) {
    return;
  }
  const nextSessionKey = projectSessionKey(project.id);
  const sessionKeys = project.sessionKeys.includes(nextSessionKey)
    ? project.sessionKeys
    : [...project.sessionKeys, nextSessionKey];
  state.activeProjectId = project.id;
  state.sessionKey = nextSessionKey;
  state.applySettings({
    ...state.settings,
    sessionKey: nextSessionKey,
    lastActiveSessionKey: nextSessionKey,
  });
  state.setTab("chat");
  if (sessionKeys !== project.sessionKeys) {
    await updateCoWorkProject(state, {
      ...project,
      sessionKeys,
    });
  }
}

export function buildCoWorkChatMessage(
  state: Pick<CoWorkState, "coWorkProjects" | "activeProjectId" | "sessionKey">,
  message: string,
) {
  const trimmed = message.trim();
  if (!trimmed.startsWith("/") && state.activeProjectId) {
    const project = resolveActiveProject(state);
    if (!project) {
      return message;
    }
    if (state.sessionKey !== projectSessionKey(project.id)) {
      return message;
    }
    const sections = [
      `CoWork Project: ${project.name}`,
      project.description ? `Description:\n${project.description}` : "",
      project.instructions ? `Instructions:\n${project.instructions}` : "",
      project.files.length > 0
        ? `Shared files:\n\n${project.files
            .map((file) => {
              const language = file.name.split(".").pop()?.trim() || "text";
              const snippet = file.content.slice(0, MAX_PROJECT_FILE_CHARS);
              const truncated =
                file.content.length > snippet.length
                  ? `\n[truncated to ${snippet.length} chars]`
                  : "";
              return `File: ${file.name}\n\`\`\`${language}\n${snippet}${truncated}\n\`\`\``;
            })
            .join("\n\n")}`
        : "",
      `User request:\n${message}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    return sections;
  }
  return message;
}
