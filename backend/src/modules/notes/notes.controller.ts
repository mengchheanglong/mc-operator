import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put, Query } from "@nestjs/common";
import { NotesService } from "./notes.service";

@Controller("api/v1/notes")
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  listNotes(@Query("projectId") projectId?: string) {
    return {
      notes: this.notesService.list(projectId),
    };
  }

  @Post()
  @HttpCode(200)
  createNote(
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    const note = this.notesService.create({
      projectId,
      content: body.content,
    });

    return {
      msg: "Note created.",
      note,
    };
  }

  @Put(":id")
  updateNote(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Query("projectId") projectId?: string,
  ) {
    if (!String(id || "").trim()) {
      throw new BadRequestException("Note ID is required.");
    }

    const note = this.notesService.update({
      id,
      projectId,
      content: body.content,
      completed: body.completed,
    });

    if (!note) {
      throw new NotFoundException("Note not found.");
    }

    return {
      msg: "Note updated.",
      note,
    };
  }

  @Delete(":id")
  deleteNote(
    @Param("id") id: string,
    @Query("projectId") projectId?: string,
  ) {
    if (!String(id || "").trim()) {
      throw new BadRequestException("Note ID is required.");
    }

    const deleted = this.notesService.delete({ id, projectId });
    if (!deleted) {
      throw new NotFoundException("Note not found.");
    }

    return {
      msg: "Note deleted.",
    };
  }
}
