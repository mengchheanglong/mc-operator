"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import axios from "axios";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buildPromptPackHref } from "@/lib/context-pack/href";
import { normalizeDocumentTitle } from "@/lib/parser/extractLinks";
import { rewriteWikiLinksToMarkdown } from "@/lib/parser/wiki-links";
import BootstrapWorkspaceButton from "@/components/BootstrapWorkspaceButton";
import {
  FileText,
  Loader2,
  Network,
  Pencil,
  Plus,
  Save,
  Search,
  Tag,
  Trash2,
  X,
  Copy,
} from "lucide-react";
import type { StoredDocument } from "@/types/document";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Doc extends StoredDocument {
  tags: string[];
}

function resolveInlineReferenceHref(href: string | undefined) {
  if (!href) {
    return null;
  }

  if (href.startsWith("#doc-ref:") || href.startsWith("doc-link:")) {
    const token = href.includes("#doc-ref:")
      ? "#doc-ref:"
      : "doc-link:";

    return {
      kind: "doc" as const,
      value: decodeURIComponent(href.slice(token.length)),
    };
  }

  if (
    href.startsWith("#missing-doc-ref:") ||
    href.startsWith("missing-doc-link:")
  ) {
    const token = href.includes("#missing-doc-ref:")
      ? "#missing-doc-ref:"
      : "missing-doc-link:";

    return {
      kind: "missing" as const,
      value: decodeURIComponent(href.slice(token.length)),
    };
  }

  try {
    const parsed = new URL(href, "http://localhost");
    if (parsed.pathname === "/dashboard/docs") {
      const documentId = parsed.searchParams.get("doc");
      if (documentId) {
        return {
          kind: "doc" as const,
          value: documentId,
        };
      }
    }
  } catch {
    return null;
  }

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
          "doc-inline-link cursor-help",
          missing ? "doc-inline-link-missing" : "",
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

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

function wordCount(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function byteSize(text: string) {
  const bytes = new Blob([text]).size;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} kB`;
}

function hasKeywordMatch(title: string, tags: string[], keywords: string[]) {
  const haystack = `${title} ${tags.join(" ")}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

function relativeTime(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function DocsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedDocFromQuery = searchParams.get("doc");

  /* ---- state ---- */
  const [docs, setDocs] = useState<Doc[]>([]);
  const [allDocs, setAllDocs] = useState<Doc[]>([]); // unfiltered, for deriving tags
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // editor
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editNewTag, setEditNewTag] = useState("");
  const [saving, setSaving] = useState(false);

  // new doc
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState<string[]>(["other"]);
  const [newTagInput, setNewTagInput] = useState("");

  /* ---- fetch ---- */
  // Fetch all docs (unfiltered) once for tag discovery
  const fetchAllDocs = useCallback(async () => {
    try {
      const res = await axios.get("/api/docs");
      const fetched = Array.isArray(res.data?.docs) ? res.data.docs : [];
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
      const fetched = Array.isArray(res.data?.docs) ? res.data.docs : [];
      setDocs(fetched);
      setError("");
    } catch {
      setError("Unable to load documents.");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeTag]);

  useEffect(() => {
    void fetchAllDocs();
  }, [fetchAllDocs]);

  useEffect(() => {
    void fetchDocs();
  }, [fetchDocs]);

  /* ---- derived ---- */
  const existingTags = useMemo(() => {
    const tagSet = new Set<string>();
    allDocs.forEach((d) => d.tags.forEach((t) => tagSet.add(t.toLowerCase())));
    return Array.from(tagSet).sort();
  }, [allDocs]);

  const shouldOfferBootstrap = useMemo(() => {
    const hasCharter = allDocs.some((doc) =>
      hasKeywordMatch(doc.title, doc.tags, ["charter", "context", "mission", "brief"]),
    );
    const hasArchitecture = allDocs.some((doc) =>
      hasKeywordMatch(doc.title, doc.tags, ["architecture", "system", "overview", "map"]),
    );
    const hasWorkflow = allDocs.some((doc) =>
      hasKeywordMatch(doc.title, doc.tags, ["workflow", "process", "quality", "done"]),
    );

    return !(hasCharter && hasArchitecture && hasWorkflow);
  }, [allDocs]);

  const selectedDoc = useMemo(
    () => allDocs.find((d) => d.id === selectedId) ?? null,
    [allDocs, selectedId],
  );

  const setSelectedDocumentId = useCallback((nextId: string | null) => {
    setSelectedId(nextId);

    const params = new URLSearchParams(searchParams.toString());
    if (nextId) {
      params.set("doc", nextId);
    } else {
      params.delete("doc");
    }

    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  const openDocument = useCallback((documentId: string) => {
    setSelectedDocumentId(documentId);
    setEditing(false);
    setCreating(false);
  }, [setSelectedDocumentId]);

  useEffect(() => {
    if (!selectedDocFromQuery) {
      if (selectedId && !allDocs.some((doc) => doc.id === selectedId)) {
        setSelectedId(null);
      }
      return;
    }

    if (!allDocs.some((doc) => doc.id === selectedDocFromQuery)) {
      return;
    }

    if (selectedId !== selectedDocFromQuery) {
      setSelectedId(selectedDocFromQuery);
      setCreating(false);
      setEditing(false);
    }
  }, [allDocs, selectedDocFromQuery, selectedId]);

  /* ---- actions ---- */
  const refreshAfterMutation = async () => {
    const all = await fetchAllDocs();
    // If filtering is active, also refresh filtered list
    if (searchQuery.trim() || activeTag) {
      await fetchDocs();
    } else {
      setDocs(all);
    }
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
        setSelectedDocumentId(created.id);
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

  const startEdit = (doc: Doc) => {
    setEditing(true);
    setEditTitle(doc.title);
    setEditContent(doc.content);
    setEditTags([...doc.tags]);
    setEditNewTag("");
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditNewTag("");
  };

  const saveEdit = async () => {
    if (!selectedId) return;
    try {
      setSaving(true);
      const res = await axios.put(`/api/docs/${selectedId}`, {
        title: editTitle.trim(),
        content: editContent,
        tags: editTags,
      });
      const updated = res.data?.doc as Doc | undefined;
      if (updated) {
        setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      }
      setEditing(false);
      setEditNewTag("");
      await refreshAfterMutation();
    } catch {
      setError("Unable to save document.");
    } finally {
      setSaving(false);
    }
  };

  const deleteDoc = async (id: string) => {
    try {
      await axios.delete(`/api/docs/${id}`);
      if (selectedId === id) {
        setSelectedDocumentId(null);
        setEditing(false);
      }
      await refreshAfterMutation();
    } catch {
      setError("Unable to delete document.");
    }
  };

  const toggleTag = (tag: string) => {
    setActiveTag((prev) => (prev === tag ? null : tag));
  };

  const toggleEditTag = (tag: string) => {
    const t = tag.toLowerCase();
    setEditTags((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const addEditCustomTag = () => {
    const tag = editNewTag.trim().toLowerCase();
    if (tag && !editTags.includes(tag)) {
      setEditTags((prev) => [...prev, tag]);
    }
    setEditNewTag("");
  };

  const toggleNewTag = (tag: string) => {
    const t = tag.toLowerCase();
    setNewTags((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const addNewCustomTag = () => {
    const tag = newTagInput.trim().toLowerCase();
    if (tag && !newTags.includes(tag)) {
      setNewTags((prev) => [...prev, tag]);
    }
    setNewTagInput("");
  };

  const renderedMarkdown = useMemo(
    () => (selectedDoc ? rewriteWikiLinksToMarkdown(selectedDoc.content, allDocs) : ""),
    [allDocs, selectedDoc],
  );

  const docsById = useMemo(
    () => new Map(allDocs.map((document) => [document.id, document])),
    [allDocs],
  );

  const mentionsByTitle = useMemo(() => {
    const nextMap = new Map<string, Doc[]>();

    for (const document of allDocs) {
      const seenLinks = new Set<string>();

      for (const link of document.links) {
        const normalizedLink = normalizeDocumentTitle(link);
        if (!normalizedLink || seenLinks.has(normalizedLink)) {
          continue;
        }

        seenLinks.add(normalizedLink);
        const existing = nextMap.get(normalizedLink);

        if (existing) {
          existing.push(document);
        } else {
          nextMap.set(normalizedLink, [document]);
        }
      }
    }

    return nextMap;
  }, [allDocs]);

  const buildReferenceTooltip = useCallback((referenceTitle: string) => {
    const normalizedTitle = normalizeDocumentTitle(referenceTitle);
    if (!normalizedTitle) {
      return "No related docs found.";
    }

    const mentioningDocs = (mentionsByTitle.get(normalizedTitle) ?? [])
      .filter((document) => document.id !== selectedDoc?.id)
      .map((document) => document.title)
      .sort((left, right) => left.localeCompare(right));

    if (mentioningDocs.length === 0) {
      return "No other docs mention this yet.";
    }

    const preview = mentioningDocs.slice(0, 3);
    const overflowCount = mentioningDocs.length - preview.length;

    return `Also mentioned in: ${preview.join(", ")}${overflowCount > 0 ? `, +${overflowCount} more` : ""}`;
  }, [mentionsByTitle, selectedDoc]);

  const markdownComponents = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        const resolvedReference = resolveInlineReferenceHref(href);
        if (resolvedReference?.kind === "doc") {
          const documentId = resolvedReference.value;
          const targetDocument = docsById.get(documentId);
          const tooltip = buildReferenceTooltip(targetDocument?.title ?? "");

          return (
            <InlineDocReference tooltip={tooltip}>
              {children}
            </InlineDocReference>
          );
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

  /* ---- render ---- */
  return (
    <div className="sidebar-shell-transition fixed top-0 right-0 bottom-0 flex w-[calc(100%-var(--sidebar-width))] overflow-hidden bg-bg-base">
      <div className="flex flex-col w-[320px] shrink-0 border-r border-border bg-bg-sidebar overflow-hidden h-full">
        {/* Top Section: Search & Tags (Pinned) */}
        <div className="flex-none flex flex-col">
        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents..."
              className="w-full rounded-lg border border-border bg-bg-base py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30"
            />
          </div>
        </div>

        {/* Tag filter chips — only tags that exist on docs */}
        {existingTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-border px-3 pb-3">
            {existingTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={[
                  "rounded-md px-2 py-0.5 text-[11px] font-medium transition-all",
                  activeTag === tag
                    ? "bg-accent-primary text-white shadow-sm"
                    : "bg-bg-card text-text-secondary hover:bg-bg-panel hover:text-text-primary",
                ].join(" ")}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
        </div>

        {/* Middle Section: Doc list (Scrollable) */}
        <div className="flex-1 min-h-0 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="ml-2 text-xs">Loading...</span>
            </div>
          ) : docs.length === 0 ? (
            <div className="px-3 py-10 text-center text-xs text-text-muted">
              No documents found.
            </div>
          ) : (
            docs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => openDocument(doc.id)}
                className={[
                  "group flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-all",
                  selectedId === doc.id
                    ? "bg-accent-primary/10 border-l-2 border-accent-primary"
                    : "border-l-2 border-transparent hover:bg-bg-panel/60",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                  <span className="truncate text-sm font-medium text-text-primary">
                    {doc.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 pl-[22px]">
                  {doc.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-accent-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-primary"
                    >
                      {tag}
                    </span>
                  ))}
                  <span className="ml-auto text-[10px] text-text-muted">
                    {relativeTime(doc.updatedAt)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Bottom Section: New Doc button (Pinned) */}
        <div className="flex-none border-t border-border p-3">
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setEditing(false);
              setSelectedDocumentId(null);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-primary/15 py-2.5 text-sm font-semibold text-accent-primary transition hover:bg-accent-primary/25"
          >
            <Plus className="h-4 w-4" />
            New Document
          </button>
          {shouldOfferBootstrap ? (
            <BootstrapWorkspaceButton
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg-card py-2.5 text-sm font-semibold text-text-secondary transition hover:bg-bg-panel hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            />
          ) : null}
        </div>
      </div>

      {/* ======================== RIGHT PANEL ======================== */}
      <div className="flex flex-1 flex-col overflow-hidden bg-bg-base">
        {error && (
          <div className="mx-4 mt-3 rounded-lg border border-status-error/30 bg-status-error/10 px-4 py-2 text-xs text-status-error">
            {error}
            <button type="button" onClick={() => setError("")} className="ml-2 underline">
              dismiss
            </button>
          </div>
        )}

        {/* ---------- Creating new doc ---------- */}
        {creating && (
          <div className="flex flex-1 flex-col overflow-y-auto p-6">
            <div className="mx-auto w-full max-w-3xl animate-fade-in space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent-primary/20 bg-accent-primary/10 text-accent-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <h1 className="matte-page-title">New Document</h1>
              </div>

              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Document title..."
                maxLength={200}
                className="w-full rounded-lg border border-border bg-bg-card px-4 py-3 text-[0.95rem] font-semibold text-white placeholder:text-text-muted outline-none transition focus:border-accent-primary"
              />

              {/* Tags — existing + custom input */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {/* Show all existing tags as toggles */}
                  {existingTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleNewTag(tag)}
                      className={[
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                        newTags.includes(tag)
                          ? "bg-accent-primary text-white"
                          : "bg-bg-card text-text-secondary hover:bg-bg-panel",
                      ].join(" ")}
                    >
                      {tag}
                    </button>
                  ))}
                  {/* Show any custom new tags not in existing */}
                  {newTags.filter((t) => !existingTags.includes(t)).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleNewTag(tag)}
                      className="rounded-md bg-accent-primary px-2.5 py-1 text-xs font-medium text-white transition-all"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5 text-text-muted" />
                  <input
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNewCustomTag(); } }}
                    placeholder="Add custom tag..."
                    maxLength={30}
                    className="flex-1 rounded-md border border-border bg-bg-base px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent-primary"
                  />
                  <button
                    type="button"
                    onClick={addNewCustomTag}
                    disabled={!newTagInput.trim()}
                    className="rounded-md bg-bg-card px-2.5 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-bg-panel hover:text-white disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </div>

              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Start writing..."
                className="min-h-[400px] w-full resize-y rounded-lg border border-border bg-bg-card p-4 font-mono text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent-primary"
              />
              <p className="matte-panel-copy">
                Supports Markdown, task lists, and internal wiki links like
                {" "}
                <span className="font-mono text-accent-primary">[[Project Brief]]</span>.
              </p>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void createDoc()}
                  disabled={saving || !newTitle.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-text-secondary transition hover:text-white"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---------- Viewing / editing selected doc ---------- */}
        {!creating && selectedDoc && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header bar */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="min-w-0 flex-1">
                {editing ? (
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    maxLength={200}
                    className="w-full border-b border-accent-primary/40 bg-transparent pb-1 text-[1.04rem] font-semibold text-white outline-none"
                  />
                ) : (
                  <h2 className="truncate text-[1.04rem] font-semibold text-white">
                    {selectedDoc.title}
                  </h2>
                )}
                <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                  <span>{byteSize(selectedDoc.content)}</span>
                  <span>|</span>
                  <span>{wordCount(selectedDoc.content)} words</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void saveEdit()}
                      disabled={saving || !editTitle.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-status-success/20 px-3 py-2 text-xs font-semibold text-status-success ring-1 ring-status-success/30 transition hover:bg-status-success/30 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary transition hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => router.push(buildPromptPackHref("doc_focus", selectedDoc.id))}
                      className="matte-action-secondary px-3 py-2 text-xs"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Build Prompt Pack
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/dashboard/graph?focus=${encodeURIComponent(selectedDoc.id)}`)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-text-secondary transition hover:border-accent-primary/30 hover:text-white"
                    >
                      <Network className="h-3.5 w-3.5" />
                      View In Graph
                    </button>
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
                      onClick={() => void deleteDoc(selectedDoc.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-status-error/20 px-3 py-2 text-xs font-semibold text-status-error/70 transition hover:bg-status-error/10 hover:text-status-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Tags row */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 px-6 py-2">
              {editing ? (
                <>
                  {/* Existing tags as toggles */}
                  {Array.from(new Set([...existingTags, ...editTags])).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleEditTag(tag)}
                      className={[
                        "rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-all",
                        editTags.includes(tag)
                          ? "bg-accent-primary text-white"
                          : "bg-bg-card text-text-muted hover:text-text-secondary",
                      ].join(" ")}
                    >
                      {tag}
                    </button>
                  ))}
                  {/* Custom tag input */}
                  <div className="flex items-center gap-1.5">
                    <Tag className="h-3 w-3 text-text-muted" />
                    <input
                      value={editNewTag}
                      onChange={(e) => setEditNewTag(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEditCustomTag(); } }}
                      placeholder="Add tag..."
                      maxLength={30}
                      className="w-24 rounded-md border border-border bg-bg-base px-2 py-0.5 text-[11px] text-text-primary placeholder:text-text-muted outline-none focus:border-accent-primary"
                    />
                    <button
                      type="button"
                      onClick={addEditCustomTag}
                      disabled={!editNewTag.trim()}
                      className="rounded-md bg-bg-card px-2 py-0.5 text-[11px] font-medium text-text-secondary transition hover:bg-bg-panel hover:text-white disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                </>
              ) : (
                selectedDoc.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-accent-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent-primary"
                  >
                    {tag}
                  </span>
                ))
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                  {editing ? (
                <div className="space-y-3">
                  <p className="matte-panel-copy">
                    Markdown and
                    {" "}
                    <span className="font-mono text-accent-primary">[[wiki links]]</span>
                    {" "}
                    are both supported here.
                  </p>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-[600px] w-full resize-y rounded-lg border border-border bg-bg-card p-5 font-mono text-sm leading-relaxed text-text-primary outline-none transition focus:border-accent-primary"
                  />
                </div>
              ) : (
                <div className="prose-chat prose-docs max-w-none text-sm leading-relaxed text-text-primary">
                  {selectedDoc.content ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {renderedMarkdown}
                    </ReactMarkdown>
                  ) : (
                    <span className="italic text-text-muted">No content yet.</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------- Empty state ---------- */}
        {!creating && !selectedDoc && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-text-muted">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-bg-card">
              <FileText className="h-7 w-7 text-accent-primary/50" />
            </div>
            <div className="text-center">
              <p className="matte-panel-heading">Select a document</p>
              <p className="mt-1 matte-panel-copy">or create a new one to get started</p>
            </div>
            {shouldOfferBootstrap ? (
              <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-card/70 p-4 text-left">
                <div className="matte-panel-heading">Need a starting scaffold?</div>
                <div className="mt-1 matte-panel-copy">
                  Bootstrap the charter, architecture map, workflow, and definition of done docs that make future Codex sessions faster.
                </div>
                <BootstrapWorkspaceButton
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent-primary/15 py-2.5 text-sm font-semibold text-accent-primary transition hover:bg-accent-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DocsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[60vh] items-center justify-center">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-card px-5 py-3 text-sm text-text-secondary shadow-lg">
            <Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
            Loading documents...
          </div>
        </div>
      }
    >
      <DocsPageContent />
    </Suspense>
  );
}
