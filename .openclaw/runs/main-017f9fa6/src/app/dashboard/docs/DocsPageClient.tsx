"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import axios from "axios";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { normalizeDocumentTitle } from "@/lib/parser/extractLinks";
import { rewriteWikiLinksToMarkdown } from "@/lib/parser/wiki-links";
import BootstrapWorkspaceButton from "@/components/BootstrapWorkspaceButton";
import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import type { StoredDocument } from "@/types/document";

interface Doc extends StoredDocument {
  tags: string[];
}

const DOCS_SIDEBAR_STORAGE_KEY = "mission-control:docs-sidebar-collapsed";

function subscribePanePreference(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener("mission-control:pane-pref-change", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("mission-control:pane-pref-change", handler);
  };
}

function getPaneCollapsedSnapshot(key: string) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key) === "1";
}

function setPaneCollapsed(key: string, nextValue: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, nextValue ? "1" : "0");
  window.dispatchEvent(new Event("mission-control:pane-pref-change"));
}

function resolveInlineReferenceHref(href: string | undefined) {
  if (!href) return null;
  if (href.startsWith("#doc-ref:") || href.startsWith("doc-link:")) {
    const token = href.includes("#doc-ref:") ? "#doc-ref:" : "doc-link:";
    return { kind: "doc" as const, value: decodeURIComponent(href.slice(token.length)) };
  }
  if (href.startsWith("#missing-doc-ref:") || href.startsWith("missing-doc-link:")) {
    const token = href.includes("#missing-doc-ref:") ? "#missing-doc-ref:" : "missing-doc-link:";
    return { kind: "missing" as const, value: decodeURIComponent(href.slice(token.length)) };
  }
  try {
    const parsed = new URL(href, "http://localhost");
    if (parsed.pathname === "/dashboard/docs") {
      const documentId = parsed.searchParams.get("doc");
      if (documentId) return { kind: "doc" as const, value: documentId };
    }
  } catch {}
  return null;
}

function InlineDocReference({
  children,
  tooltip,
  missing = false,
}: {
  children: ReactNode;
  tooltip: string;
  missing?: boolean;
}) {
  return (
    <span className="group relative inline-flex align-baseline">
      <span
        className={[
          "cursor-help rounded-sm border-b border-dashed border-accent-primary/40 text-accent-hover",
          missing ? "border-text-muted/60 text-text-primary/85" : "",
        ].join(" ")}
        title={tooltip}
      >
        {children}
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-max max-w-[260px] -translate-x-1/2 whitespace-normal rounded-md border border-border bg-bg-sidebar/95 px-2.5 py-1.5 text-[11px] font-medium leading-relaxed text-text-secondary shadow-xl backdrop-blur group-hover:block">
        {tooltip}
      </span>
    </span>
  );
}

const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
const byteSize = (text: string) => {
  const bytes = new Blob([text]).size;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`;
};
const relativeTime = (dateStr: string) => {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

function hasKeywordMatch(title: string, tags: string[], keywords: string[]) {
  const haystack = `${title} ${tags.join(" ")}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

const MAP_DOC_KEYWORDS = [
  "map",
  "moc",
  "hub",
  "index",
  "charter",
  "workflow",
  "architecture",
  "guide",
];

function isMapDocument(doc: Pick<Doc, "title" | "tags">) {
  return hasKeywordMatch(doc.title, doc.tags, MAP_DOC_KEYWORDS);
}

function getDocGraphRole(doc: Doc, allDocs: Doc[]) {
  const normalizedTitle = normalizeDocumentTitle(doc.title);
  const incomingCount = allDocs.reduce((count, candidate) => {
    if (candidate.id === doc.id) return count;
    return candidate.links.some((link) => normalizeDocumentTitle(link) === normalizedTitle)
      ? count + 1
      : count;
  }, 0);
  const outgoingCount = doc.links.length;

  if (isMapDocument(doc) || outgoingCount >= 3) {
    return "hub";
  }
  if (incomingCount > 0 && outgoingCount > 0) {
    return "bridge";
  }
  if (incomingCount === 0 && outgoingCount === 0) {
    return "orphan";
  }

  return null;
}

export default function DocsPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedDocFromQuery = searchParams.get("doc");
  const selectedTagFromQuery = searchParams.get("tag");
  const selectedSearchFromQuery = searchParams.get("search");

  const [docs, setDocs] = useState<Doc[]>([]);
  const [allDocs, setAllDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editNewTag, setEditNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState<string[]>(["other"]);
  const [newTagInput, setNewTagInput] = useState("");
  const storedSidebarCollapsed = useSyncExternalStore(
    subscribePanePreference,
    () => getPaneCollapsedSnapshot(DOCS_SIDEBAR_STORAGE_KEY),
    () => false,
  );
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const sidebarCollapsed = sidebarCompact || storedSidebarCollapsed;

  const setQueryValue = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const fetchAllDocs = useCallback(async () => {
    try {
      const res = await axios.get("/api/docs");
      const fetched = Array.isArray(res.data?.docs) ? (res.data.docs as Doc[]) : [];
      setAllDocs(fetched);
      return fetched;
    } catch {
      return [];
    }
  }, []);

  const fetchDocs = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (activeTag) params.tag = activeTag;
      const res = await axios.get("/api/docs", { params });
      setDocs(Array.isArray(res.data?.docs) ? (res.data.docs as Doc[]) : []);
      setError("");
    } catch {
      setError("Unable to load documents.");
    } finally {
      setLoading(false);
    }
  }, [activeTag, searchQuery]);

  useEffect(() => {
    void fetchAllDocs();
  }, [fetchAllDocs]);

  useEffect(() => {
    void fetchDocs();
  }, [fetchDocs]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1180px)");
    const syncViewport = () => setSidebarCompact(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    const nextTag = selectedTagFromQuery?.trim().toLowerCase() || null;
    if (nextTag !== activeTag) setActiveTag(nextTag);
  }, [activeTag, selectedTagFromQuery]);

  useEffect(() => {
    const nextSearch = selectedSearchFromQuery?.trim() || "";
    if (nextSearch !== searchQuery) setSearchQuery(nextSearch);
  }, [searchQuery, selectedSearchFromQuery]);

  useEffect(() => {
    if (!selectedDocFromQuery) return;
    if (selectedId !== selectedDocFromQuery) setSelectedId(selectedDocFromQuery);
  }, [selectedDocFromQuery, selectedId]);

  const existingTags = useMemo(() => {
    const tagSet = new Set<string>();
    allDocs.forEach((doc) => doc.tags.forEach((tag) => tagSet.add(tag.toLowerCase())));
    return Array.from(tagSet).sort();
  }, [allDocs]);

  const shouldOfferBootstrap = useMemo(() => {
    const hasCharter = allDocs.some((doc) => hasKeywordMatch(doc.title, doc.tags, ["charter", "context", "mission", "brief"]));
    const hasArchitecture = allDocs.some((doc) => hasKeywordMatch(doc.title, doc.tags, ["architecture", "system", "overview", "map"]));
    const hasWorkflow = allDocs.some((doc) => hasKeywordMatch(doc.title, doc.tags, ["workflow", "process", "quality", "done"]));
    return !(hasCharter && hasArchitecture && hasWorkflow);
  }, [allDocs]);

  const selectedDoc = useMemo(() => allDocs.find((doc) => doc.id === selectedId) ?? docs[0] ?? null, [allDocs, docs, selectedId]);
  const orderedDocs = useMemo(
    () =>
      [...docs].sort((left, right) => {
        const leftIsMap = isMapDocument(left);
        const rightIsMap = isMapDocument(right);
        if (leftIsMap !== rightIsMap) {
          return leftIsMap ? -1 : 1;
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      }),
    [docs],
  );

  useEffect(() => {
    if (!selectedId && docs[0]) setSelectedId(docs[0].id);
  }, [docs, selectedId]);

  const refreshAfterMutation = useCallback(async () => {
    const all = await fetchAllDocs();
    if (searchQuery.trim() || activeTag) await fetchDocs();
    else setDocs(all);
  }, [activeTag, fetchAllDocs, fetchDocs, searchQuery]);

  const openDocument = useCallback((documentId: string) => {
    setSelectedId(documentId);
    setQueryValue("doc", documentId);
    setEditing(false);
    setCreating(false);
  }, [setQueryValue]);

  const startEdit = (doc: Doc) => {
    setEditing(true);
    setCreating(false);
    setEditTitle(doc.title);
    setEditContent(doc.content);
    setEditTags([...doc.tags]);
    setEditNewTag("");
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditNewTag("");
  };

  const beginCreate = () => {
    setCreating(true);
    setEditing(false);
    setSelectedId(null);
    setQueryValue("doc", null);
    setNewTitle("");
    setNewContent("");
    setNewTags(["other"]);
    setNewTagInput("");
  };

  const createDoc = async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      setSaving(true);
      const res = await axios.post("/api/docs", {
        title,
        content: newContent,
        tags: newTags.length ? newTags : ["other"],
      });
      const created = res.data?.doc as Doc | undefined;
      if (created) {
        setSelectedId(created.id);
        setQueryValue("doc", created.id);
      }
      setCreating(false);
      setNewTitle("");
      setNewContent("");
      setNewTags(["other"]);
      setNewTagInput("");
      await refreshAfterMutation();
    } catch {
      setError("Unable to create document.");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!selectedId) return;
    try {
      setSaving(true);
      await axios.put(`/api/docs/${selectedId}`, {
        title: editTitle.trim(),
        content: editContent,
        tags: editTags,
      });
      setEditing(false);
      await refreshAfterMutation();
    } catch {
      setError("Unable to save document.");
    } finally {
      setSaving(false);
    }
  };

  const removeDoc = async (id: string) => {
    try {
      await axios.delete(`/api/docs/${id}`);
      if (selectedId === id) {
        setSelectedId(null);
        setQueryValue("doc", null);
      }
      setEditing(false);
      await refreshAfterMutation();
    } catch {
      setError("Unable to delete document.");
    }
  };

  const renderedMarkdown = useMemo(
    () => (selectedDoc ? rewriteWikiLinksToMarkdown(selectedDoc.content, allDocs) : ""),
    [allDocs, selectedDoc],
  );

  const docsById = useMemo(() => new Map(allDocs.map((document) => [document.id, document])), [allDocs]);

  const mentionsByTitle = useMemo(() => {
    const nextMap = new Map<string, Doc[]>();
    for (const document of allDocs) {
      const seenLinks = new Set<string>();
      for (const link of document.links) {
        const normalizedLink = normalizeDocumentTitle(link);
        if (!normalizedLink || seenLinks.has(normalizedLink)) continue;
        seenLinks.add(normalizedLink);
        const existing = nextMap.get(normalizedLink);
        if (existing) existing.push(document);
        else nextMap.set(normalizedLink, [document]);
      }
    }
    return nextMap;
  }, [allDocs]);

  const buildReferenceTooltip = useCallback(
    (referenceTitle: string) => {
      const normalizedTitle = normalizeDocumentTitle(referenceTitle);
      if (!normalizedTitle) return "No related docs found.";
      const mentioningDocs = (mentionsByTitle.get(normalizedTitle) ?? [])
        .filter((document) => document.id !== selectedDoc?.id)
        .map((document) => document.title)
        .sort((left, right) => left.localeCompare(right));
      if (mentioningDocs.length === 0) return "No other docs mention this yet.";
      const preview = mentioningDocs.slice(0, 3);
      const overflowCount = mentioningDocs.length - preview.length;
      return `Also mentioned in: ${preview.join(", ")}${overflowCount > 0 ? `, +${overflowCount} more` : ""}`;
    },
    [mentionsByTitle, selectedDoc],
  );

  const markdownComponents = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        const resolvedReference = resolveInlineReferenceHref(href);
        if (resolvedReference?.kind === "doc") {
          const targetDocument = docsById.get(resolvedReference.value);
          const tooltip = buildReferenceTooltip(targetDocument?.title ?? "");
          return <InlineDocReference tooltip={tooltip}>{children}</InlineDocReference>;
        }
        if (resolvedReference?.kind === "missing") {
          return <span className="text-text-primary/85">{children}</span>;
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-accent-hover underline decoration-accent-primary/40 underline-offset-2 transition hover:text-accent-glow"
          >
            {children}
          </a>
        );
      },
    }),
    [buildReferenceTooltip, docsById],
  );

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-bg-base">
      <aside
        className={[
          "flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-bg-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          sidebarCollapsed ? "w-[4.75rem]" : "w-[20rem]",
        ].join(" ")}
      >
        <div
          className={[
            "relative min-h-[5.25rem] overflow-hidden border-b border-border",
            sidebarCollapsed ? "px-2" : "px-4",
          ].join(" ")}
        >
          <div
            className={[
              "absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              sidebarCollapsed ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-2 opacity-0",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={() => setPaneCollapsed(DOCS_SIDEBAR_STORAGE_KEY, false)}
              className="group/logo relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-border bg-bg-elevated text-text-primary shadow-sm transition-all duration-200 hover:border-text-muted hover:bg-border"
              title="Expand docs sidebar"
              disabled={sidebarCompact}
            >
              <span className="transition-[opacity,transform] duration-200 group-hover/logo:-translate-x-1 group-hover/logo:opacity-0">
                <BookOpenText className="h-4 w-4" />
              </span>
              <span className="absolute inset-0 flex translate-x-1 items-center justify-center opacity-0 transition-[opacity,transform] duration-200 group-hover/logo:translate-x-0 group-hover/logo:opacity-100">
                <ChevronRight className="h-4 w-4" />
              </span>
            </button>
          </div>

          <div
            className={[
              "absolute inset-0 flex items-center transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              sidebarCollapsed ? "pointer-events-none -translate-x-3 opacity-0" : "translate-x-0 opacity-100",
            ].join(" ")}
          >
            <div className="flex w-full items-center justify-between gap-3 px-4">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-elevated text-text-primary shadow-sm">
                  <BookOpenText className="h-4 w-4" />
                </div>
                <div className="min-w-0 overflow-hidden">
                  <div className="text-sm font-semibold text-text-primary">Docs</div>
                  <div className="text-xs text-text-muted">Durable project knowledge</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaneCollapsed(DOCS_SIDEBAR_STORAGE_KEY, true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-all duration-200 hover:bg-bg-elevated hover:text-text-primary"
                title="Collapse docs sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div
          className={[
            "overflow-hidden border-b border-border transition-[max-height,opacity,padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            sidebarCollapsed ? "max-h-0 px-0 py-0 opacity-0" : "max-h-48 px-4 py-4 opacity-100",
          ].join(" ")}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={searchQuery}
              onChange={(event) => {
                const value = event.target.value;
                setSearchQuery(value);
                setQueryValue("search", value.trim() ? value : null);
              }}
              placeholder="Search documents..."
              className="w-full rounded-lg border border-border bg-bg-base py-2.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30"
            />
          </div>

          {existingTags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {existingTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const nextTag = activeTag === tag ? null : tag;
                    setActiveTag(nextTag);
                    setQueryValue("tag", nextTag);
                  }}
                  className={[
                    "rounded-md px-2 py-1 text-[11px] font-semibold transition",
                    activeTag === tag
                      ? "bg-accent-primary text-black"
                      : "bg-bg-elevated text-text-secondary hover:bg-bg-card hover:text-text-primary",
                  ].join(" ")}
                >
                  {tag}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="ml-2 text-xs">Loading...</span>
            </div>
          ) : docs.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-text-muted">
              {searchQuery || activeTag ? "No documents match the current filters." : "No documents yet."}
            </div>
          ) : (
            orderedDocs.map((doc) => {
              const active = !creating && selectedDoc?.id === doc.id;
              const graphRole = getDocGraphRole(doc, allDocs);
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => openDocument(doc.id)}
                  title={sidebarCollapsed ? doc.title : undefined}
                  className={[
                    "group flex w-full border-l-2 text-left transition",
                    sidebarCollapsed ? "items-center justify-center px-3 py-3" : "flex-col gap-1.5 px-4 py-3",
                    active ? "border-accent-primary bg-bg-elevated" : "border-transparent hover:bg-bg-elevated",
                  ].join(" ")}
                >
                  <div className={["flex w-full items-start", sidebarCollapsed ? "justify-center" : "gap-2"].join(" ")}>
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                    {!sidebarCollapsed ? (
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-text-primary">{doc.title}</div>
                        <div className="mt-1 text-[11px] text-text-muted">
                          {relativeTime(doc.updatedAt)} - {wordCount(doc.content)} words
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {!sidebarCollapsed && (doc.tags.length > 0 || isMapDocument(doc) || graphRole) ? (
                    <div className="flex flex-wrap gap-1 pl-6">
                      {isMapDocument(doc) ? (
                        <span className="rounded bg-accent-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-accent-primary">
                          Map doc
                        </span>
                      ) : null}
                      {graphRole && !isMapDocument(doc) ? (
                        <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                          {graphRole}
                        </span>
                      ) : null}
                      {doc.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        {!sidebarCollapsed ? (
          <div className="border-t border-border p-3">
            <button
              type="button"
              onClick={beginCreate}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg-card py-2.5 text-sm font-semibold text-text-secondary transition hover:bg-bg-panel hover:text-white"
            >
              <Plus className="h-4 w-4" />
              New Document
            </button>
          </div>
        ) : null}
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-bg-base">
        {error ? (
          <div className="mx-4 mt-3 rounded-lg border border-status-error/30 bg-status-error/10 px-4 py-2 text-xs text-status-error">
            {error}
          </div>
        ) : null}

        {creating ? (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
              <div>
                <h1 className="text-[1.05rem] font-semibold text-white">New Document</h1>
                <p className="mt-1 text-sm text-text-muted">Create a durable note for architecture, workflow, or project context.</p>
              </div>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary transition hover:bg-bg-panel hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="mx-auto flex max-w-4xl flex-col gap-4">
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="Document title"
                  className="w-full rounded-xl border border-border bg-bg-card px-4 py-3 text-base font-semibold text-text-primary outline-none transition focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30"
                />
                <textarea
                  value={newContent}
                  onChange={(event) => setNewContent(event.target.value)}
                  placeholder="Write the durable context here..."
                  className="min-h-[360px] w-full rounded-xl border border-border bg-bg-card px-4 py-4 text-sm leading-7 text-text-primary outline-none transition focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30"
                />
                <div className="rounded-xl border border-border bg-bg-card p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                    <Tag className="h-3.5 w-3.5" />
                    Tags
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {existingTags.map((tag) => {
                      const active = newTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() =>
                            setNewTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]))
                          }
                          className={[
                            "rounded-md px-2 py-1 text-[11px] font-semibold transition",
                            active ? "bg-accent-primary text-black" : "bg-bg-elevated text-text-secondary hover:text-text-primary",
                          ].join(" ")}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={newTagInput}
                      onChange={(event) => setNewTagInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          const tag = newTagInput.trim().toLowerCase();
                          if (tag && !newTags.includes(tag)) setNewTags((prev) => [...prev, tag]);
                          setNewTagInput("");
                        }
                      }}
                      placeholder="Add custom tag"
                      className="flex-1 rounded-lg border border-border bg-bg-base px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const tag = newTagInput.trim().toLowerCase();
                        if (tag && !newTags.includes(tag)) setNewTags((prev) => [...prev, tag]);
                        setNewTagInput("");
                      }}
                      className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-secondary transition hover:bg-bg-elevated hover:text-white"
                    >
                      Add
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  {shouldOfferBootstrap ? <BootstrapWorkspaceButton /> : <div />}
                  <button
                    type="button"
                    onClick={() => void createDoc()}
                    disabled={saving || !newTitle.trim()}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-card px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-bg-panel disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save document
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : selectedDoc ? (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="border-b border-border px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-[1.05rem] font-semibold text-white">{selectedDoc.title}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <span>{relativeTime(selectedDoc.updatedAt)}</span>
                    <span>|</span>
                    <span>{wordCount(selectedDoc.content)} words</span>
                    <span>|</span>
                    <span>{byteSize(selectedDoc.content)}</span>
                    {isMapDocument(selectedDoc) ? (
                      <>
                        <span>|</span>
                        <span className="text-accent-primary">map doc</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(selectedDoc)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary transition hover:bg-bg-panel hover:text-white"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeDoc(selectedDoc.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-status-error/30 px-3 py-2 text-xs font-semibold text-status-error transition hover:bg-status-error/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </div>
              {selectedDoc.tags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selectedDoc.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setActiveTag(tag);
                        setQueryValue("tag", tag);
                      }}
                      className="rounded-md bg-bg-card px-2.5 py-0.5 text-[11px] font-semibold text-text-secondary transition hover:bg-bg-elevated hover:text-white"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="prose-chat prose-docs max-w-4xl text-sm leading-relaxed text-text-primary">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {renderedMarkdown}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-text-muted">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-bg-card">
              <FileText className="h-7 w-7 text-accent-primary/50" />
            </div>
            <div className="text-center">
              <p className="matte-panel-heading">Select a document</p>
              <p className="mt-1 matte-panel-copy">Open a durable project note or create a new one.</p>
            </div>
          </div>
        )}

        {editing && selectedDoc ? (
          <div className="absolute inset-0 z-10 flex min-h-0 flex-col overflow-hidden bg-bg-base">
            <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
              <div>
                <h1 className="text-[1.05rem] font-semibold text-white">Edit Document</h1>
                <p className="mt-1 text-sm text-text-muted">Update the durable reference without leaving the docs surface.</p>
              </div>
              <button
                type="button"
                onClick={cancelEdit}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary transition hover:bg-bg-panel hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="mx-auto flex max-w-4xl flex-col gap-4">
                <input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  className="w-full rounded-xl border border-border bg-bg-card px-4 py-3 text-base font-semibold text-text-primary outline-none transition focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30"
                />
                <textarea
                  value={editContent}
                  onChange={(event) => setEditContent(event.target.value)}
                  className="min-h-[360px] w-full rounded-xl border border-border bg-bg-card px-4 py-4 text-sm leading-7 text-text-primary outline-none transition focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30"
                />
                <div className="rounded-xl border border-border bg-bg-card p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                    <Tag className="h-3.5 w-3.5" />
                    Tags
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {existingTags.map((tag) => {
                      const active = editTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() =>
                            setEditTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]))
                          }
                          className={[
                            "rounded-md px-2 py-1 text-[11px] font-semibold transition",
                            active ? "bg-accent-primary text-black" : "bg-bg-elevated text-text-secondary hover:text-text-primary",
                          ].join(" ")}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={editNewTag}
                      onChange={(event) => setEditNewTag(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          const tag = editNewTag.trim().toLowerCase();
                          if (tag && !editTags.includes(tag)) setEditTags((prev) => [...prev, tag]);
                          setEditNewTag("");
                        }
                      }}
                      placeholder="Add custom tag"
                      className="flex-1 rounded-lg border border-border bg-bg-base px-3 py-2 text-sm text-text-primary outline-none transition focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const tag = editNewTag.trim().toLowerCase();
                        if (tag && !editTags.includes(tag)) setEditTags((prev) => [...prev, tag]);
                        setEditNewTag("");
                      }}
                      className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-secondary transition hover:bg-bg-elevated hover:text-white"
                    >
                      Add
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void saveEdit()}
                    disabled={saving || !editTitle.trim()}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-card px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-bg-panel disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
