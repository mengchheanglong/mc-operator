import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { QuestsService } from "./quests.service";

@Controller("api/v1/quests")
export class QuestsController {
  constructor(private readonly questsService: QuestsService) {}

  @Get()
  listQuests(
    @Query("projectId") projectId?: string,
    @Query("limit") limitRaw?: string,
    @Query("skip") skipRaw?: string,
    @Query("completed") completedRaw?: string,
    @Query("status") statusRaw?: string,
    @Query("area") areaRaw?: string,
    @Query("withMeta") withMetaRaw?: string,
  ) {
    const parsedLimit = Number.parseInt(limitRaw || "1000", 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 1000))
      : 1000;

    const parsedSkip = Number.parseInt(skipRaw || "0", 10);
    const skip = Number.isFinite(parsedSkip) ? Math.max(0, parsedSkip) : 0;

    const completed =
      completedRaw === "true"
        ? true
        : completedRaw === "false"
          ? false
          : undefined;

    const status =
      statusRaw && ["open", "in_progress", "blocked", "done"].includes(statusRaw)
        ? statusRaw
        : undefined;

    const area = String(areaRaw || "").trim() || undefined;

    return this.questsService.list({
      projectId,
      limit,
      skip,
      completed,
      status: status as "open" | "in_progress" | "blocked" | "done" | undefined,
      area,
      withMeta: withMetaRaw === "1",
    });
  }

  @Get(":id")
  getQuestById(
    @Param("id") id: string,
    @Query("projectId") projectId?: string,
  ) {
    const quest = this.questsService.findById({ id, projectId });
    if (!quest) {
      throw new NotFoundException("Quest not found.");
    }
    return { quest };
  }

  @Post()
  @HttpCode(200)
  createQuest(
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    const quest = this.questsService.create({
      ...body,
      projectId,
    });
    return {
      msg: "Quest created.",
      quest,
    };
  }

  @Put(":id/complete")
  @HttpCode(200)
  toggleQuestCompletion(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    const result = this.questsService.toggleCompletion({
      id,
      projectId,
      verificationSummary: body.verificationSummary,
      verificationEvidence: body.verificationEvidence,
    });
    if (!result) {
      throw new NotFoundException("Quest not found.");
    }
    return {
      msg: result.quest.completed ? "Quest completed." : "Quest reopened.",
      quest: result.quest,
      verificationEvidence: result.verificationEvidence,
    };
  }

  @Put(":id")
  @HttpCode(200)
  updateQuest(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    const result = this.questsService.update({
      id,
      projectId,
      ...body,
    });
    if (!result) {
      throw new NotFoundException("Quest not found.");
    }
    return {
      msg: "Quest updated.",
      quest: result.quest,
      transition: result.transition,
      verificationEvidence: result.verificationEvidence,
    };
  }

  @Delete(":id")
  deleteQuest(
    @Param("id") id: string,
    @Query("projectId") projectId?: string,
  ) {
    const deleted = this.questsService.delete({ id, projectId });
    if (!deleted) {
      throw new NotFoundException("Quest not found.");
    }
    return {
      msg: "Quest deleted.",
    };
  }
}
