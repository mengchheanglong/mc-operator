import {
  BadRequestException,
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
import { DocsService } from "./docs.service";

@Controller("api/v1/docs")
export class DocsController {
  constructor(private readonly docsService: DocsService) {}

  @Get()
  listDocs(
    @Query("projectId") projectId?: string,
    @Query("search") search?: string,
    @Query("tag") tag?: string,
    @Query("fileType") fileType?: string,
    @Query("limit") limit?: string,
    @Query("skip") skip?: string,
  ) {
    const docs = this.docsService.list({
      projectId,
      search,
      tag,
      fileType,
      limit,
      skip,
    });
    return { docs };
  }

  @Post()
  @HttpCode(200)
  createDoc(
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    const doc = this.docsService.create({
      projectId,
      title: body.title,
      content: body.content,
      tags: body.tags,
      fileType: body.fileType,
      scope: body.scope,
    });
    return {
      msg: "Document created.",
      doc,
    };
  }

  @Get(":id")
  getDocById(
    @Param("id") id: string,
    @Query("projectId") projectId?: string,
  ) {
    if (!String(id || "").trim()) {
      throw new BadRequestException("Document ID is required.");
    }

    const doc = this.docsService.findById({ id, projectId });
    if (!doc) {
      throw new NotFoundException("Document not found.");
    }
    return { doc };
  }

  @Put(":id")
  @HttpCode(200)
  updateDoc(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    if (!String(id || "").trim()) {
      throw new BadRequestException("Document ID is required.");
    }

    const hasAnyField =
      body.title !== undefined ||
      body.content !== undefined ||
      body.tags !== undefined ||
      body.fileType !== undefined ||
      body.scope !== undefined;
    if (!hasAnyField) {
      throw new BadRequestException("No valid fields provided for update.");
    }

    const doc = this.docsService.update({
      id,
      projectId,
      title: body.title,
      content: body.content,
      tags: body.tags,
      fileType: body.fileType,
      scope: body.scope,
    });
    if (!doc) {
      throw new NotFoundException("Document not found.");
    }
    return {
      msg: "Document updated.",
      doc,
    };
  }

  @Delete(":id")
  deleteDoc(
    @Param("id") id: string,
    @Query("projectId") projectId?: string,
  ) {
    if (!String(id || "").trim()) {
      throw new BadRequestException("Document ID is required.");
    }
    const deleted = this.docsService.delete({ id, projectId });
    if (!deleted) {
      throw new NotFoundException("Document not found.");
    }
    return {
      msg: "Document deleted.",
    };
  }
}
