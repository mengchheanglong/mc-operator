"use client";

import { Suspense, type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Clock3,
  Copy,
  FileText,
  FolderKanban,
  GitBranch,
  Layers3,
  ListChecks,
  Loader2,
  Network,
  Sparkles,
  StickyNote,
  Target,
} from "lucide-react";
import type { ContextFocusType, ContextPack, ContextSource } from "@/types/context-pack";
import { PROMPT_PACK_ROUTE } from "@/lib/context-pack/href";

interface PromptOption {
  id: string;
  title: string;
}

interface FocusOption {
  id: ContextFocusType;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

const FOCUS_OPTIONS: FocusOption[] = [
  {
    id: "workspace",
    title: "Workspace",
    description: "Build one briefing from active quests, recent docs, notes, and reports.",
    icon: Layers3,
  },
  {
    id: "quest_focus",
    title: "Quest",
    description: "Center the session on one open objective and the docs that support it.",
    icon: Target,
  },
  {
    id: "doc_focus",
    title: "Document",
    description: "Prepare Codex to extend, refactor, or connect one note in the vault.",
    icon: FileText,
  },
  {
    id: "graph_focus",
    title: "Graph",
    description: "Work from one graph node and its immediate local cluster.",
    icon: Network,
  },
];

const VALID_FOCUS_TYPES: ContextFocusType[] = FOCUS_OPTIONS.map((option) => option.id);

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getInitialFocusType(searchParams: URLSearchParams | ReturnType<typeof useSearchParams>) {
  const focusType = searchParams.get("focusType") as ContextFocusType | null;
  return focusType && VALID_FOCUS_TYPES.includes(focusType) ? focusType : "workspace";
}

function getFocusOption(focusType: ContextFocusType) {
  return FOCUS_OPTIONS.find((option) => option.id === focusType) || FOCUS_OPTIONS[0];
}

function formatTimestamp(dateValue: string) {
  return new Date(dateValue).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildClipboardContent(contextPack: ContextPack) {
  return [
    contextPack.suggestedPrompts.codex,
    "",
    `Project: ${contextPack.project.name}`,
    `Project path: ${contextPack.project.relativePath}`,
    "",
    `Workspace readiness: ${contextPack.readiness.score}/100 (${contextPack.readiness.status})`,
    contextPack.readiness.summary,
    "",
    "Collaboration guide:",
    ...contextPack.collaborationGuide.workflow.map((item) => `- ${item}`),
    "",
    "Update rules:",
    ...contextPack.collaborationGuide.updateRules.map((item) => `- ${item}`),
    "",
    "Repo snapshot:",
    `- Summary: ${contextPack.repoSnapshot.summary}`,
    ...contextPack.repoSnapshot.stack.map((item) => `- Stack: ${item}`),
    ...contextPack.repoSnapshot.dashboardSurfaces.map((item) => `- Surface: ${item}`),
    ...contextPack.repoSnapshot.verificationPresets.map(
      (preset) => `- Verify with ${preset.label}: ${preset.command}`,
    ),
    `- Code intelligence: ${contextPack.repoSnapshot.codeIntel.summary}`,
    `- Override file: ${contextPack.repoSnapshot.codeIntel.overrideFilePath}`,
    ...contextPack.repoSnapshot.codeIntel.tools.map(
      (tool) => `- ${tool.language}: ${tool.status} via ${tool.server} (${tool.source})`,
    ),
    ...(contextPack.repoSnapshot.git.available
      ? [
          `- Git: ${contextPack.repoSnapshot.git.summary}`,
          ...contextPack.repoSnapshot.git.changedFiles.map(
            (change) => `- Changed file ${change.status}: ${change.path}`,
          ),
        ]
      : []),
    ...contextPack.repoSnapshot.hotspots.map(
      (hotspot) => `- Hotspot: ${hotspot.path} - ${hotspot.reason}`,
    ),
    "",
    "Context files to read first:",
    ...contextPack.contextFiles.map((file) => `- ${file.path}`),
    "",
    "Session handoff:",
    `- Summary: ${contextPack.handoff.summary}`,
    `- Next step: ${contextPack.handoff.nextStep}`,
    ...contextPack.handoff.verificationCommands.map(
      (command) => `- Verify: ${command}`,
    ),
    ...contextPack.handoff.changedFiles.map(
      (change) => `- Changed file ${change.status}: ${change.path}`,
    ),
    ...contextPack.handoff.recentCommits.map(
      (commit) => `- Recent commit ${commit.hash}: ${commit.subject}`,
    ),
    "",
    "Suggested action:",
    `- ${contextPack.suggestedAction}`,
    "",
    "Success criteria:",
    ...contextPack.successCriteria.map((item) => `- ${item}`),
    "",
    "Relevant docs:",
    ...(contextPack.relevantDocs.length
      ? contextPack.relevantDocs.map(
          (doc) => `- ${doc.title}: ${doc.excerpt || doc.content || "No excerpt available."}`,
        )
      : ["- None"]),
  ].join("\n");
}

function PreviewMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="matte-panel-subtle p-4">
      <div className="matte-section-title">{label}</div>
      <div className="mt-2 matte-stat-value">{value}</div>
      <div className="mt-1 matte-stat-copy">{detail}</div>
    </div>
  );
}

function SourceList({
  title,
  emptyLabel,
  items,
  icon: Icon,
}: {
  title: string;
  emptyLabel: string;
  items: ContextSource[];
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="matte-panel-subtle p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-text-secondary" />
        <div className="matte-section-title">{title}</div>
      </div>

      {items.length === 0 ? (
        <div className="mt-3 matte-panel-copy">{emptyLabel}</div>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-bg-panel px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="matte-panel-heading">{item.title}</div>
                  <div className="mt-1 matte-panel-copy">
                    {item.excerpt || item.content || "No extra detail available."}
                  </div>
                </div>
                {item.metadata?.relation ? (
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    {item.metadata.relation.replaceAll("_", " ")}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PromptGenerator() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFocusType = getInitialFocusType(searchParams);
  const initialFocusId = searchParams.get("focusId") || "";
  const autoGenerateRef = useRef(Boolean(searchParams.get("focusType") || searchParams.get("focusId")));
  const [focusType, setFocusType] = useState<ContextFocusType>(initialFocusType);
  const [focusId, setFocusId] = useState(initialFocusId);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState("");
  const [contextPack, setContextPack] = useState<ContextPack | null>(null);
  const [copied, setCopied] = useState(false);
  const [docOptions, setDocOptions] = useState<PromptOption[]>([]);
  const [questOptions, setQuestOptions] = useState<PromptOption[]>([]);

  useEffect(() => {
    const nextFocusType = getInitialFocusType(searchParams);
    const nextFocusId = searchParams.get("focusId") || "";
    setFocusType(nextFocusType);
    setFocusId(nextFocusId);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        setLoadingOptions(true);

        const [docsResponse, questsResponse] = await Promise.all([
          fetch("/api/docs?limit=100", { cache: "no-store" }),
          fetch("/api/quests?limit=100", { cache: "no-store" }),
        ]);

        const docsPayload = await docsResponse.json();
        const questsPayload = await questsResponse.json();

        if (cancelled) {
          return;
        }

        const docs = Array.isArray(docsPayload?.docs)
          ? docsPayload.docs.map((doc: { id: string; title: string }) => ({
              id: String(doc.id),
              title: String(doc.title || "Untitled"),
            }))
          : [];

        const quests = Array.isArray(questsPayload)
          ? questsPayload
              .filter((quest: { completed?: boolean }) => !quest.completed)
              .map((quest: { _id?: string; id?: string; goal?: string }) => ({
                id: String(quest._id || quest.id || ""),
                title: String(quest.goal || "Untitled quest"),
              }))
              .filter((quest: PromptOption) => Boolean(quest.id))
          : [];

        setDocOptions(docs);
        setQuestOptions(quests);
      } catch {
        if (!cancelled) {
          setError("Unable to load Prompt Pack options.");
        }
      } finally {
        if (!cancelled) {
          setLoadingOptions(false);
        }
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (focusType === "workspace") {
      if (focusId) {
        setFocusId("");
      }
      return;
    }

    if (loadingOptions) {
      return;
    }

    const options = focusType === "quest_focus" ? questOptions : docOptions;
    if (options.length === 0) {
      setFocusId("");
      return;
    }

    if (!focusId || !options.some((option) => option.id === focusId)) {
      setFocusId(options[0].id);
    }
  }, [docOptions, focusId, focusType, loadingOptions, questOptions]);

  const selectedTarget = useMemo(() => {
    if (focusType === "quest_focus") {
      return questOptions.find((quest) => quest.id === focusId) || null;
    }

    if (focusType === "doc_focus" || focusType === "graph_focus") {
      return docOptions.find((doc) => doc.id === focusId) || null;
    }

    return null;
  }, [docOptions, focusId, focusType, questOptions]);

  const focusOption = useMemo(() => getFocusOption(focusType), [focusType]);
  const focusOptions = focusType === "quest_focus" ? questOptions : docOptions;
  const hasTargetRequirement = focusType !== "workspace";
  const isReadyToGenerate = !loading && !loadingOptions && (!hasTargetRequirement || Boolean(focusId));

  const updateQueryString = useCallback(
    (nextFocusType: ContextFocusType, nextFocusId?: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("focusType", nextFocusType);

      if (nextFocusType === "workspace" || !nextFocusId) {
        params.delete("focusId");
      } else {
        params.set("focusId", nextFocusId);
      }

      const query = params.toString();
      router.replace(query ? `${PROMPT_PACK_ROUTE}?${query}` : PROMPT_PACK_ROUTE, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const generatePack = useCallback(
    async (nextFocusType = focusType, nextFocusId = focusId) => {
      const requiresTarget = nextFocusType !== "workspace";
      if (requiresTarget && !nextFocusId) {
        setError("Select a target before generating a Prompt Pack.");
        return;
      }

      setLoading(true);
      setCopied(false);
      setError("");

      try {
        const url = new URL("/api/context/export", window.location.origin);
        url.searchParams.set("focusType", nextFocusType);
        if (nextFocusId) {
          url.searchParams.set("focusId", nextFocusId);
        }

        const response = await fetch(url.toString(), { cache: "no-store" });
        const payload = await response.json();

        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Failed to generate context pack.");
        }

        setContextPack(payload.pack);
        updateQueryString(nextFocusType, nextFocusId);
      } catch (generationError) {
        setError(
          generationError instanceof Error
            ? generationError.message
            : "Failed to generate context pack.",
        );
      } finally {
        setLoading(false);
      }
    },
    [focusId, focusType, updateQueryString],
  );

  useEffect(() => {
    const hasResolvedTarget = focusType === "workspace" || Boolean(selectedTarget?.id);
    if (loadingOptions || !autoGenerateRef.current || !hasResolvedTarget) {
      return;
    }

    autoGenerateRef.current = false;
    void generatePack(focusType, focusType === "workspace" ? "" : selectedTarget?.id || focusId);
  }, [focusId, focusType, generatePack, loadingOptions, selectedTarget]);

  const copyToClipboard = useCallback(async () => {
    if (!contextPack) {
      return;
    }

    await navigator.clipboard.writeText(buildClipboardContent(contextPack));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [contextPack]);

  return (
    <div className="matte-page mx-auto flex h-full w-full max-w-7xl overflow-y-auto px-6 py-8 lg:px-10">
      <div className="matte-page-header">
        <div className="matte-header-copy">
          <h1 className="matte-page-title">Build a clean Codex work brief.</h1>
          <p className="matte-subtitle">
            Choose the right workspace focus, generate a concise brief, then hand one structured pack to Codex.
          </p>
        </div>
        <div className="matte-actions">
          <span className="matte-chip">
            {focusOption.title}
            {selectedTarget ? ` - ${selectedTarget.title}` : ""}
          </span>
          {contextPack ? (
            <span className="matte-chip">
              {contextPack.project.relativePath}
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="matte-panel-muted px-4 py-3 matte-panel-copy">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.98fr,1.42fr]">
        <section className="matte-panel p-6">
          <div className="space-y-6">
            <div>
              <div className="matte-section-title">Step 1</div>
              <h2 className="mt-2 matte-panel-heading">Choose a focus</h2>
              <p className="mt-1 matte-panel-copy">
                The best brief starts with the right scope. Keep it broad for planning, or narrow it to one quest, note, or graph node.
              </p>
            </div>

            <div className="grid gap-2">
              {FOCUS_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = focusType === option.id;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setFocusType(option.id);
                      setContextPack(null);
                      setError("");
                    }}
                    className={cn(
                      "rounded-2xl border px-4 py-4 text-left transition",
                      isActive
                        ? "border-text-muted bg-bg-elevated text-white"
                        : "border-border bg-bg-panel/65 text-text-secondary hover:bg-bg-panel hover:text-white",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-black/20 text-text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="matte-panel-heading">{option.title}</div>
                        <div className="mt-1 matte-panel-copy">{option.description}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="matte-panel-subtle p-4">
              <div className="matte-section-title">Step 2</div>
              <h3 className="mt-2 matte-panel-heading">
                {hasTargetRequirement ? `Select a ${focusType === "quest_focus" ? "quest" : "target note"}` : "Use the whole workspace"}
              </h3>
              <p className="mt-1 matte-panel-copy">
                {hasTargetRequirement
                  ? `Prompt Pack will center the brief on one ${focusType === "quest_focus" ? "quest" : focusType === "graph_focus" ? "graph node" : "document"}.`
                  : "Workspace mode blends open quests, recent docs, notes, and reports into one planning brief."}
              </p>

              {hasTargetRequirement ? (
                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-bg-panel px-3 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-black/20 text-text-primary">
                    <focusOption.icon className="h-4 w-4" />
                  </div>
                  <select
                    value={focusId}
                    onChange={(event) => {
                      setFocusId(event.target.value);
                      setContextPack(null);
                    }}
                    disabled={loadingOptions || focusOptions.length === 0}
                    className="w-full bg-transparent text-sm text-white outline-none disabled:text-text-muted"
                  >
                    {loadingOptions ? (
                      <option>Loading options...</option>
                    ) : focusOptions.length === 0 ? (
                      <option>No options available</option>
                    ) : (
                      focusOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.title}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-border bg-bg-panel px-4 py-3 matte-panel-copy">
                  Workspace mode is ready immediately. No additional target selection is required.
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <PreviewMetric
                label="Docs"
                value={docOptions.length}
                detail="Available notes that can anchor a focused brief."
              />
              <PreviewMetric
                label="Quests"
                value={questOptions.length}
                detail="Open objectives that can drive implementation work."
              />
              <PreviewMetric
                label="Pack mode"
                value={focusOption.title}
                detail={selectedTarget ? selectedTarget.title : "No target selected yet."}
              />
            </div>

            <div className="matte-panel-subtle p-4">
              <div className="matte-section-title">Step 3</div>
              <h3 className="mt-2 matte-panel-heading">Generate the brief</h3>
              <p className="mt-1 matte-panel-copy">
                The generated pack includes the objective, next move, collaboration protocol, repo map, success criteria, context file paths, and the notes Codex should read before editing code.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void generatePack()}
              disabled={!isReadyToGenerate}
              className="matte-action-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              {loading ? "Generating brief" : "Generate Prompt Pack"}
            </button>
          </div>
        </section>

        <section className="matte-panel flex min-h-[720px] flex-col overflow-hidden">
          <div className="border-b border-border px-6 py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="matte-section-title">Preview</div>
                <h2 className="mt-2 matte-panel-heading">Codex briefing</h2>
                <p className="mt-1 matte-panel-copy">
                  Review the generated brief before copying it into your IDE session.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyToClipboard()}
                disabled={!contextPack}
                className="matte-action-secondary px-4 py-2 text-sm disabled:opacity-50"
              >
                {copied ? <Check className="h-4 w-4 text-text-primary" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy Codex Brief"}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {!contextPack ? (
              <div className="flex h-full items-center justify-center">
                <div className="matte-empty w-full max-w-2xl space-y-4 p-6 text-left">
                  <div>
                    <div className="matte-section-title">What will be generated</div>
                    <h3 className="mt-2 matte-panel-heading">A concise IDE work brief</h3>
                    <p className="mt-2 matte-panel-copy">
                      Prompt Pack will assemble your chosen scope into a Codex-ready session brief with a collaboration protocol, repo map, file paths, relevant notes, and concrete completion criteria.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="matte-panel-subtle p-4">
                      <div className="matte-panel-heading">Scope</div>
                      <div className="mt-1 matte-panel-copy">{focusOption.description}</div>
                    </div>
                    <div className="matte-panel-subtle p-4">
                      <div className="matte-panel-heading">Protocol</div>
                      <div className="mt-1 matte-panel-copy">The pack includes how Docs, Quests, Reports, and Prompt Pack should stay in sync.</div>
                    </div>
                    <div className="matte-panel-subtle p-4">
                      <div className="matte-panel-heading">Repo Map</div>
                      <div className="mt-1 matte-panel-copy">Stack, surfaces, scripts, and key files are attached so Codex can orient quickly.</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <PreviewMetric
                    label="Project"
                    value={contextPack.project.name}
                    detail={contextPack.project.relativePath}
                  />
                  <PreviewMetric
                    label="Scope"
                    value={contextPack.scope.label}
                    detail="The current focus of this generated work session."
                  />
                  <PreviewMetric
                    label="Files"
                    value={contextPack.contextFiles.length}
                    detail="Workspace context files Codex should read first."
                  />
                  <PreviewMetric
                    label="Docs"
                    value={contextPack.relevantDocs.length}
                    detail="Relevant notes attached to this pack."
                  />
                  <PreviewMetric
                    label="Checks"
                    value={contextPack.successCriteria.length}
                    detail="Conditions the final implementation should satisfy."
                  />
                  <PreviewMetric
                    label="Readiness"
                    value={`${contextPack.readiness.score}/100`}
                    detail={contextPack.readiness.status}
                  />
                  <PreviewMetric
                    label="Dirty Files"
                    value={contextPack.repoSnapshot.git.changedFiles.length}
                    detail={
                      contextPack.repoSnapshot.git.branch ||
                      "Git metadata unavailable"
                    }
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                  <div className="matte-panel-subtle p-4">
                    <div className="matte-section-title">Objective</div>
                    <p className="mt-3 text-[0.92rem] leading-7 text-white">{contextPack.objective}</p>
                  </div>

                  <div className="matte-panel-subtle p-4">
                    <div className="matte-section-title">Session note</div>
                    <div className="mt-3 space-y-3 text-[0.84rem] text-text-secondary">
                      <div>
                        <span className="font-semibold text-white">Project:</span>{" "}
                        {contextPack.project.name}
                      </div>
                      <div>
                        <span className="font-semibold text-white">Path:</span>{" "}
                        <span className="font-mono text-[11px] text-text-primary">
                          {contextPack.project.relativePath}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-white">Next move:</span> {contextPack.suggestedAction}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <Clock3 className="h-3.5 w-3.5" />
                        Generated {formatTimestamp(contextPack.timestamp)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  <div className="matte-panel-subtle p-4">
                    <div className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 text-text-secondary" />
                      <div className="matte-section-title">Session Handoff</div>
                    </div>
                    <div className="mt-3 space-y-4 text-sm text-text-secondary">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Summary
                        </div>
                        <div className="mt-2 text-white">{contextPack.handoff.summary}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Next Step
                        </div>
                        <div className="mt-2">{contextPack.handoff.nextStep}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Verification
                        </div>
                        {contextPack.handoff.verificationCommands.length === 0 ? (
                          <div className="mt-2 matte-panel-copy">
                            No verification commands were detected.
                          </div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {contextPack.handoff.verificationCommands.map((command) => (
                              <div
                                key={command}
                                className="rounded-xl border border-border bg-bg-panel px-3 py-3 font-mono text-[11px] text-text-primary"
                              >
                                {command}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Changed Files
                        </div>
                        {contextPack.handoff.changedFiles.length === 0 ? (
                          <div className="mt-2 matte-panel-copy">Working tree is clean.</div>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {contextPack.handoff.changedFiles.map((change) => (
                              <div
                                key={`${change.status}-${change.path}`}
                                className="rounded-xl border border-border bg-bg-panel px-3 py-3"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-mono text-[11px] text-text-primary">
                                    {change.path}
                                  </span>
                                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                                    {change.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {contextPack.handoff.recentCommits.length > 0 ? (
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                            Recent Commits
                          </div>
                          <div className="mt-2 space-y-2">
                            {contextPack.handoff.recentCommits.map((commit) => (
                              <div
                                key={commit.hash}
                                className="rounded-xl border border-border bg-bg-panel px-3 py-3"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="matte-panel-heading">{commit.subject}</span>
                                  <span className="font-mono text-[11px] text-text-muted">
                                    {commit.hash}
                                  </span>
                                </div>
                                <div className="mt-1 matte-panel-copy">{commit.date}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="matte-panel-subtle p-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-text-secondary" />
                      <div className="matte-section-title">Collaboration Guide</div>
                    </div>
                    <div className="mt-3 space-y-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Workflow
                        </div>
                        <ul className="mt-2 space-y-2 text-sm text-text-secondary">
                          {contextPack.collaborationGuide.workflow.map((item) => (
                            <li key={item} className="flex gap-2">
                              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-text-muted" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Update Rules
                        </div>
                        <ul className="mt-2 space-y-2 text-sm text-text-secondary">
                          {contextPack.collaborationGuide.updateRules.map((item) => (
                            <li key={item} className="flex gap-2">
                              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-text-muted" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="matte-panel-subtle p-4">
                    <div className="flex items-center gap-2">
                      <ListChecks className="h-4 w-4 text-text-secondary" />
                      <div className="matte-section-title">Success Criteria</div>
                    </div>
                    <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                      {contextPack.successCriteria.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-text-muted" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="matte-panel-subtle p-4">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-text-secondary" />
                      <div className="matte-section-title">Repo Snapshot</div>
                    </div>
                    <div className="mt-3 text-sm text-text-secondary">
                      {contextPack.repoSnapshot.summary}
                    </div>
                    <div className="mt-3 rounded-xl border border-border bg-bg-panel px-3 py-3">
                      <div className="matte-panel-heading">{contextPack.project.name}</div>
                      <div className="mt-1 font-mono text-[11px] text-text-primary">
                        {contextPack.project.relativePath}
                      </div>
                      <div className="mt-2 matte-panel-copy">
                        {contextPack.repoSnapshot.git.summary}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {contextPack.repoSnapshot.stack.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-border bg-bg-panel px-3 py-1 text-xs text-text-secondary"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Surfaces
                        </div>
                        <div className="mt-2 space-y-1 text-sm text-text-secondary">
                          {contextPack.repoSnapshot.dashboardSurfaces.slice(0, 6).map((surface) => (
                            <div key={surface}>{surface}</div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Scripts
                        </div>
                        <div className="mt-2 space-y-1 text-sm text-text-secondary">
                          {contextPack.repoSnapshot.scripts.slice(0, 5).map((script) => (
                            <div key={script.name}>
                              <span className="font-medium text-white">{script.name}</span>
                              {" - "}
                              {script.command}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Verification
                        </div>
                        <div className="mt-2 space-y-1 text-sm text-text-secondary">
                          {contextPack.repoSnapshot.verificationPresets.length === 0 ? (
                            <div>No verification commands detected.</div>
                          ) : (
                            contextPack.repoSnapshot.verificationPresets.map((preset) => (
                              <div key={preset.command}>
                                <span className="font-medium text-white">{preset.label}</span>
                                {" - "}
                                {preset.command}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Hotspots
                        </div>
                        <div className="mt-2 space-y-2 text-sm text-text-secondary">
                          {contextPack.repoSnapshot.hotspots.length === 0 ? (
                            <div>No hotspots detected.</div>
                          ) : (
                            contextPack.repoSnapshot.hotspots.map((hotspot) => (
                              <div key={hotspot.path} className="rounded-xl border border-border bg-bg-panel px-3 py-3">
                                <div className="font-mono text-[11px] text-text-primary">
                                  {hotspot.path}
                                </div>
                                <div className="mt-1 matte-panel-copy">
                                  {hotspot.reason}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Code Intelligence
                      </div>
                      <div className="mt-2 rounded-xl border border-border bg-bg-panel px-3 py-3">
                      <div className="matte-panel-heading">
                        {contextPack.repoSnapshot.codeIntel.summary}
                      </div>
                      <div className="mt-2 font-mono text-[11px] text-text-primary">
                        {contextPack.repoSnapshot.codeIntel.overrideFilePath}
                      </div>
                      {contextPack.repoSnapshot.codeIntel.overrideError ? (
                        <div className="mt-2 text-xs text-[#eadcc8]">
                          Override error: {contextPack.repoSnapshot.codeIntel.overrideError}
                        </div>
                      ) : null}
                      {contextPack.repoSnapshot.codeIntel.tools.length === 0 ? (
                        <div className="mt-1 matte-panel-copy">
                          No language-specific semantic tooling was detected yet.
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {contextPack.repoSnapshot.codeIntel.tools.map((tool) => (
                              <div
                                key={`${tool.language}-${tool.server}`}
                                className="rounded-xl border border-border bg-bg-base px-3 py-3"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="matte-panel-heading">{tool.language}</span>
                                  <span
                                    className={cn(
                                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
                                      tool.status === "ready"
                                        ? "border-border bg-bg-panel text-text-secondary"
                                        : tool.status === "partial"
                                          ? "border-[#6f7694]/22 bg-[#6f7694]/10 text-text-primary"
                                          : "border-[#b3956c]/22 bg-[#b3956c]/10 text-[#eadcc8]",
                                    )}
                                  >
                                    {tool.status}
                                  </span>
                                </div>
                                <div className="mt-1 matte-panel-copy">{tool.detail}</div>
                                <div className="mt-2 text-[11px] text-text-muted">
                                  {tool.server} - {tool.source}
                                </div>
                                {tool.runtimeSignals.length > 0 ? (
                                  <div className="mt-2 text-[11px] text-text-muted">
                                    Runtime: {tool.runtimeSignals.join(", ")}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                        {contextPack.repoSnapshot.codeIntel.notes.length > 0 ? (
                          <div className="mt-3 space-y-1 text-sm text-text-secondary">
                            {contextPack.repoSnapshot.codeIntel.notes.map((item) => (
                              <div key={item}>{item}</div>
                            ))}
                          </div>
                        ) : null}
                        {contextPack.repoSnapshot.codeIntel.suggestions.length > 0 ? (
                          <div className="mt-3 space-y-1 text-sm text-text-secondary">
                            {contextPack.repoSnapshot.codeIntel.suggestions.map((item) => (
                              <div key={item}>{item}</div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="matte-panel-subtle p-4">
                    <div className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 text-text-secondary" />
                      <div className="matte-section-title">Context Files</div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {contextPack.contextFiles.map((file) => (
                        <div key={file.path} className="rounded-xl border border-border bg-bg-panel px-3 py-3">
                          <div className="matte-panel-heading">{file.label}</div>
                          <div className="mt-1 font-mono text-[11px] text-text-primary">{file.path}</div>
                          <div className="mt-1 matte-panel-copy">{file.purpose}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="matte-panel-subtle p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-text-secondary" />
                    <div className="matte-section-title">Assistant Readiness</div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="text-2xl font-semibold text-white">
                      {contextPack.readiness.score}
                      <span className="ml-1 text-sm text-text-muted">/100</span>
                    </div>
                    <div className="text-sm text-text-secondary">
                      {contextPack.readiness.summary}
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {contextPack.readiness.checks.map((check) => (
                      <div
                        key={check.id}
                        className="flex items-start gap-3 rounded-xl border border-border bg-bg-panel px-3 py-3"
                      >
                        <span
                          className={cn(
                            "mt-1 h-2.5 w-2.5 rounded-full",
                            check.ready ? "bg-[#8ab886]" : "bg-[#b3956c]",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="matte-panel-heading">{check.label}</div>
                          <div className="mt-1 matte-panel-copy">{check.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {contextPack.collaborationGuide.nextInputs.length > 0 ? (
                    <div className="mt-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Missing Inputs To Add Next
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {contextPack.collaborationGuide.nextInputs.map((item) => (
                          <span
                            key={item}
                            className="rounded-full border border-border bg-bg-panel px-3 py-1 text-xs text-text-secondary"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <SourceList
                    title="Relevant Docs"
                    emptyLabel="No focused docs were attached to this pack."
                    items={contextPack.relevantDocs}
                    icon={FileText}
                  />
                  <SourceList
                    title="Active Quests"
                    emptyLabel="No active quests were included in this pack."
                    items={contextPack.activeQuests}
                    icon={Target}
                  />
                </div>

                <SourceList
                  title="Related Notes"
                  emptyLabel="No notes were attached to this pack."
                  items={contextPack.relatedNotes}
                  icon={StickyNote}
                />

                <div className="matte-panel-subtle p-4">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-text-secondary" />
                    <div className="matte-section-title">Recent Activity</div>
                  </div>
                  {contextPack.recentActivity.length === 0 ? (
                    <div className="mt-3 matte-panel-copy">No recent activity was included.</div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {contextPack.recentActivity.map((item) => (
                        <div key={`${item.action}-${item.title}-${item.date}`} className="rounded-xl border border-border bg-bg-panel px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="matte-panel-heading">{item.title}</div>
                              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-text-muted">{item.action}</div>
                            </div>
                            <div className="text-xs text-text-muted">{formatTimestamp(item.date)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {contextPack.graphContext?.focalNode ? (
                  <div className="matte-panel-subtle p-4">
                    <div className="flex items-center gap-2">
                      <Network className="h-4 w-4 text-text-secondary" />
                      <div className="matte-section-title">Graph Context</div>
                    </div>
                    <div className="mt-3 matte-panel-heading">{contextPack.graphContext.focalNode.title}</div>
                    <div className="mt-1 matte-panel-copy">
                      Tags: {contextPack.graphContext.focalNode.tags.length > 0 ? contextPack.graphContext.focalNode.tags.join(", ") : "No tags"}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {contextPack.graphContext.neighbors.map((neighbor) => (
                        <span
                          key={`${neighbor.relation}-${neighbor.id}`}
                          className="rounded-full border border-border bg-bg-panel px-3 py-1 text-xs text-text-secondary"
                        >
                          {neighbor.relation}: {neighbor.title}
                        </span>
                      ))}
                    </div>
                    {contextPack.graphContext.unresolvedLinks.length > 0 ? (
                      <div className="mt-3 text-xs leading-6 text-text-secondary">
                        Unresolved links: {contextPack.graphContext.unresolvedLinks.join(", ")}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="matte-panel-subtle p-4">
                  <div className="flex items-center gap-2">
                    <Copy className="h-4 w-4 text-text-secondary" />
                    <div className="matte-section-title">Codex Prompt</div>
                  </div>
                  <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-bg-panel p-4 font-mono text-xs leading-6 text-text-secondary">
                    {contextPack.suggestedPrompts.codex}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function PromptPackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-white">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      }
    >
      <PromptGenerator />
    </Suspense>
  );
}
