import { Controller, Get } from "@nestjs/common";
import { SqliteService } from "../../infra/sqlite/sqlite.service";

@Controller("api/v1/health")
export class HealthController {
  constructor(private readonly sqlite: SqliteService) {}

  @Get()
  getHealth() {
    const users = this.sqlite.connection
      .prepare("SELECT COUNT(*) AS total FROM users")
      .get() as { total: number };

    return {
      ok: true,
      service: "mc-operator-backend",
      dbPath: this.sqlite.resolvedDbPath,
      users: users.total,
      timestamp: new Date().toISOString(),
    };
  }
}
