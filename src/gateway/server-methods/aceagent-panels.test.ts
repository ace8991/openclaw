import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GatewayRequestHandlers } from "./types.js";

const mocks = vi.hoisted(() => ({
  workspaceRoot: "",
  loadConfig: vi.fn(() => ({})),
}));

vi.mock("../../config/config.js", () => ({
  loadConfig: mocks.loadConfig,
}));

vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentWorkspaceDir: () => mocks.workspaceRoot,
}));

vi.mock("../../agents/workspace.js", () => ({
  resolveDefaultAgentWorkspaceDir: () => mocks.workspaceRoot,
}));

const { aceAgentPanelsHandlers } = await import("./aceagent-panels.js");

type HandlerName = keyof typeof aceAgentPanelsHandlers;

async function invoke(
  method: HandlerName,
  params: Record<string, unknown> = {},
  clientIp = "127.0.0.1",
) {
  const respond = vi.fn();
  const handler = aceAgentPanelsHandlers[method] as GatewayRequestHandlers[HandlerName];
  await handler({
    req: { type: "req", id: "test-req", method },
    params,
    client: clientIp ? ({ clientIp } as never) : null,
    isWebchatConnect: () => false,
    respond,
    context: {} as never,
  });
  return respond;
}

describe("aceagent panel handlers", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aceagent-panels-"));
    mocks.workspaceRoot = tempRoot;
    await fs.mkdir(path.join(tempRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "README.md"), "# AceAgent\n", "utf8");
    await fs.writeFile(path.join(tempRoot, "src", "example.ts"), "export const ok = true;\n", "utf8");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects panel methods for non-local connections", async () => {
    const respond = await invoke("ace.files.list", {}, "203.0.113.10");
    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "INVALID_REQUEST",
        message: "This method is restricted to authenticated local connections.",
      }),
    );
  });

  it("lists ace workspace files", async () => {
    const respond = await invoke("ace.files.list");
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        rootPath: tempRoot,
        currentPath: tempRoot,
        entries: expect.arrayContaining([
          expect.objectContaining({ path: "README.md", type: "file" }),
          expect.objectContaining({ path: "src", type: "dir" }),
          expect.objectContaining({ path: "src/example.ts", type: "file" }),
        ]),
      }),
    );
  });

  it("reads ace workspace files", async () => {
    const respond = await invoke("ace.file.read", { path: "src/example.ts" });
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        path: "src/example.ts",
        absolutePath: path.join(tempRoot, "src", "example.ts"),
        content: "export const ok = true;\n",
        truncated: false,
      }),
    );
  });

  it("runs ace commands inside the workspace root", async () => {
    const respond = await invoke("ace.command.run", { command: "echo aceagent" });
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        command: "echo aceagent",
        cwd: tempRoot,
        code: 0,
        stdout: expect.stringContaining("aceagent"),
      }),
    );
  });

  it("persists CoWork projects in the workspace root", async () => {
    const projects = [
      {
        id: "project-1",
        name: "Project 1",
        description: "shared context",
        instructions: "Always answer in French.",
        files: [{ name: "context.md", content: "hello", mimeType: "text/markdown", size: 5 }],
        sessionKeys: ["cowork:project-1"],
        createdAt: 1,
        updatedAt: 2,
        color: "#c0392b",
      },
    ];

    const setRespond = await invoke("cowork.projects.set", { projects });
    expect(setRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        success: true,
        path: path.join(tempRoot, "cowork-projects.json"),
      }),
    );

    const getRespond = await invoke("cowork.projects.get");
    expect(getRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        path: path.join(tempRoot, "cowork-projects.json"),
        projects: expect.arrayContaining([
          expect.objectContaining({
            id: "project-1",
            name: "Project 1",
            sessionKeys: ["cowork:project-1"],
          }),
        ]),
      }),
    );
  });

  it("lists and reads desktop files inside allowed roots", async () => {
    const listRespond = await invoke("desktop.fs.list", { path: tempRoot });
    expect(listRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        currentPath: tempRoot,
        roots: expect.arrayContaining([tempRoot]),
        entries: expect.arrayContaining([
          expect.objectContaining({ name: "README.md", type: "file" }),
          expect.objectContaining({ name: "src", type: "dir" }),
        ]),
      }),
    );

    const readRespond = await invoke("desktop.fs.read", {
      path: path.join(tempRoot, "README.md"),
    });
    expect(readRespond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        path: path.join(tempRoot, "README.md"),
        content: "# AceAgent\n",
        truncated: false,
      }),
    );
  });
});
