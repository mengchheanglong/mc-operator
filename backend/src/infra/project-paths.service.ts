import { Injectable } from "@nestjs/common";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_PROJECT_ID = "mission-control";

@Injectable()
export class ProjectPathsService {
  private asString(value: unknown) {
    return String(value ?? "").trim();
  }

  resolveProjectId(projectId?: unknown) {
    return this.asString(projectId) || DEFAULT_PROJECT_ID;
  }

  resolveControlPlaneRoot() {
    const cwd = process.cwd();
    if (path.basename(cwd).toLowerCase() === "backend") {
      return path.resolve(cwd, "..");
    }
    return cwd;
  }

  resolveWorkspaceRoot() {
    if (process.env.OPENCLAW_WORKSPACE_ROOT?.trim()) {
      return path.resolve(process.env.OPENCLAW_WORKSPACE_ROOT.trim());
    }

    const controlPlaneRoot = this.resolveControlPlaneRoot();
    const parent = path.resolve(controlPlaneRoot, "..");
    return fs.existsSync(parent) ? parent : controlPlaneRoot;
  }

  resolveProjectRoot(projectId?: unknown) {
    const normalizedProjectId = this.resolveProjectId(projectId);
    const workspaceRoot = this.resolveWorkspaceRoot();
    const candidate = path.resolve(workspaceRoot, normalizedProjectId);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const controlPlaneRoot = this.resolveControlPlaneRoot();
    if (path.basename(controlPlaneRoot) === normalizedProjectId) {
      return controlPlaneRoot;
    }

    const fallback = path.resolve(workspaceRoot, DEFAULT_PROJECT_ID);
    if (fs.existsSync(fallback)) {
      return fallback;
    }
    return controlPlaneRoot;
  }

  resolveProjectRelativePath(projectRoot: string) {
    return path.relative(this.resolveWorkspaceRoot(), projectRoot).replace(/\\/g, "/");
  }
}
