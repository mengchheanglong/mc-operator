import { Controller, HttpException, Post, Query } from "@nestjs/common";
import { CodeGraphIndexService } from "./code-graph-index.service";

@Controller("api/v1/code-graph")
export class CodeGraphIndexController {
  constructor(private readonly codeGraphIndexService: CodeGraphIndexService) {}

  @Post("index")
  indexActiveProject(@Query("projectId") projectId?: string) {
    const result = this.codeGraphIndexService.indexProject(projectId);
    if (result.statusCode !== 200) {
      throw new HttpException(
        {
          success: result.success,
          message: result.message,
          output: result.output,
        },
        result.statusCode,
      );
    }
    return {
      success: true,
      message: result.message,
      output: result.output,
    };
  }
}
