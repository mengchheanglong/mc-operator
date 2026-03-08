"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { 
  FileText, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Info, 
  AlertTriangle,
  Filter,
  RefreshCw,
  Trash2,
  X
} from "lucide-react";
import type { ReportCategory, ReportStatus } from "@/server/repositories/reports-repo";

interface Report {
  id: string;
  title: string;
  content: string;
  category: ReportCategory;
  status: ReportStatus;
  source: string;
  metadata?: Record<string, unknown>;
  date: string;
}

interface ReportApiPayload {
  _id?: string;
  id?: string;
  title?: string;
  content?: string;
  category?: ReportCategory;
  status?: ReportStatus;
  source?: string;
  metadata?: Record<string, unknown>;
  date?: string;
}

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  system: "System",
  task: "Task",
  chat: "Chat",
  file: "File",
  research: "Research",
  error: "Error",
  maintenance: "Maintenance",
};

const CATEGORY_COLORS: Record<ReportCategory, string> = {
  system: "bg-bg-panel text-text-secondary border-border",
  task: "bg-bg-panel text-text-secondary border-border",
  chat: "bg-bg-panel text-text-secondary border-border",
  file: "bg-bg-panel text-text-secondary border-border",
  research: "bg-bg-panel text-text-secondary border-border",
  error: "bg-bg-panel text-text-secondary border-border",
  maintenance: "bg-bg-panel text-text-secondary border-border",
};

const STATUS_ICONS: Record<ReportStatus, React.ReactNode> = {
  info: <Info className="h-4 w-4" />,
  success: <CheckCircle className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  error: <AlertCircle className="h-4 w-4" />,
};

const STATUS_COLORS: Record<ReportStatus, string> = {
  info: "text-text-secondary",
  success: "text-text-secondary",
  warning: "text-text-secondary",
  error: "text-text-secondary",
};

export default function ReportPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | "all">("all");
  const [selectedStatus, setSelectedStatus] = useState<ReportStatus | "all">("all");
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedCategory !== "all") params.set("category", selectedCategory);
      if (selectedStatus !== "all") params.set("status", selectedStatus);
      
      const response = await axios.get(`/api/reports?${params.toString()}`);
      const mapped = (Array.isArray(response.data) ? response.data : []).map(
        (report: ReportApiPayload) => ({
          id: String(report._id || report.id || ""),
          title: String(report.title || ""),
          content: String(report.content || ""),
          category: (report.category as ReportCategory) || "system",
          status: (report.status as ReportStatus) || "info",
          source: String(report.source || "OpenClaw"),
          metadata: report.metadata || {},
          date: String(report.date || new Date().toISOString()),
        }),
      );

      setReports(mapped);
      setError("");
    } catch {
      setError("Unable to load reports.");
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedStatus]);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  const deleteReport = async (id: string) => {
    try {
      await axios.delete(`/api/reports/${id}`);
      setReports((current) => current.filter((report) => report.id !== id));
      if (expandedReport === id) setExpandedReport(null);
    } catch {
      setError("Unable to delete report.");
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    reports.forEach((r) => {
      counts[r.category] = (counts[r.category] || 0) + 1;
    });
    return counts;
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports;
  }, [reports]);

  return (
    <div className="matte-page mx-auto w-full max-w-5xl animate-fade-in pb-10 text-text-primary">
      <header className="matte-page-header">
        <div className="flex items-center gap-3">
          <div className="matte-icon-frame">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="matte-page-title">Agent Reports</h1>
            <p className="mt-1 matte-panel-copy">
              Organized reports from OpenClaw control chat - {reports.length} total
            </p>
          </div>
        </div>
      </header>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {["system", "task", "chat", "file"].map((cat) => (
          <div
            key={cat}
            className="rounded-xl border border-border bg-bg-card p-3 cursor-pointer transition-all hover:border-text-muted/30"
            onClick={() => setSelectedCategory(cat as ReportCategory)}
          >
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase px-2 py-1 rounded border ${CATEGORY_COLORS[cat as ReportCategory]}`}>
                {CATEGORY_LABELS[cat as ReportCategory]}
              </span>
            </div>
            <p className="mt-2 matte-stat-value">{categoryCounts[cat] || 0}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <section className="matte-panel p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-text-secondary">
            <Filter className="h-4 w-4" />
            <span className="matte-panel-copy font-medium">Filters</span>
          </div>
          
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as ReportCategory | "all")}
            className="input-discord text-sm py-1.5 px-3 cursor-pointer appearance-none"
          >
            <option value="all">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as ReportStatus | "all")}
            className="input-discord text-sm py-1.5 px-3 cursor-pointer appearance-none"
          >
            <option value="all">All Statuses</option>
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>

          <button
            onClick={() => void fetchReports()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-panel px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-white hover:border-text-muted/30 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </section>

      {error && (
        <p className="matte-panel-muted px-4 py-3 text-sm text-text-secondary">
          {error}
        </p>
      )}

      {/* Reports List */}
      <section className="space-y-3">
        {loading ? (
          <div className="matte-panel flex items-center justify-center py-10 text-text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2 text-sm">Loading reports...</span>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="matte-empty py-10 text-center">
            <FileText className="h-8 w-8 mx-auto text-text-muted mb-2" />
            <p className="text-sm text-text-secondary">No reports yet.</p>
            <p className="text-xs text-text-muted mt-1">
              Reports will appear here when the agent logs activity.
            </p>
          </div>
        ) : (
          filteredReports.map((report) => (
            <article
              key={report.id}
              className="matte-panel overflow-hidden transition-all hover:border-text-muted/30"
            >
              <div
                className="p-4 cursor-pointer"
                onClick={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 leading-none rounded border ${CATEGORY_COLORS[report.category]}`}>
                        {CATEGORY_LABELS[report.category]}
                      </span>
                      <span className={`flex items-center gap-1 text-xs font-medium ${STATUS_COLORS[report.status]}`}>
                        {STATUS_ICONS[report.status]}
                        <span className="capitalize">{report.status}</span>
                      </span>
                      <span className="text-xs text-text-muted">- {report.source}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-text-primary">{report.title}</h3>
                    <p className="text-xs text-text-muted">
                      {formatDate(report.date)}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteReport(report.id);
                      }}
                      className="rounded-md p-2 text-text-secondary transition-colors hover:bg-status-error/10 hover:text-status-error"
                      title="Delete report"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {expandedReport === report.id && (
                <div className="border-t border-border bg-bg-panel/30 px-4 py-4">
                  <div className="prose prose-invert prose-sm max-w-none">
                    <p className="text-sm text-text-secondary whitespace-pre-wrap">{report.content}</p>
                  </div>
                  
                  {report.metadata && Object.keys(report.metadata).length > 0 && (
                    <div className="mt-4 rounded-lg border border-border bg-bg-card p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">Metadata</p>
                      <pre className="text-xs text-text-secondary overflow-x-auto">
                        {JSON.stringify(report.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}

