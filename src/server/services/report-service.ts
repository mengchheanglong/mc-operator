/**
 * Legacy compatibility surface for older task prompts/tools.
 * Canonical implementations live in:
 * - repositories/reports-repo.ts
 * - services/daily-report-log-service.ts
 */
export * from "@/server/repositories/reports-repo";
export {
  listDailyReportLogs,
  syncDailyReportLogForDate,
  type DailyReportLogItem,
} from "@/server/services/daily-report-log-service";

