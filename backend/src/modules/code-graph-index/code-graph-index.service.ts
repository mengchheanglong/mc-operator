import { Injectable } from "@nestjs/common";
import { execFileSync } from "node:child_process";
import { ProjectPathsService } from "../../infra/project-paths.service";

function commandExists(commandName: string) {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  try {
    execFileSync(locator, [commandName], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class CodeGraphIndexService {
  constructor(private readonly projectPaths: ProjectPathsService) {}

  indexProject(projectId?: unknown) {
    if (!commandExists("cgc")) {
      return {
        success: false,
        message:
          "CodeGraphContext CLI is not available on PATH yet. Install it before indexing the active project.",
        output: "",
        statusCode: 400,
      };
    }

    const projectRoot = this.projectPaths.resolveProjectRoot(projectId);
    try {
      const output = execFileSync("cgc", ["index", projectRoot], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
        },
      }).trim();

      return {
        success: true,
        message: "Active project indexed with CodeGraphContext.",
        output,
        statusCode: 200,
      };
    } catch (error) {
      const output =
        error instanceof Error ? error.message.trim() : "CodeGraphContext indexing failed.";
      return {
        success: false,
        message: "Failed to index the active project with CodeGraphContext.",
        output,
        statusCode: 400,
      };
    }
  }
}
