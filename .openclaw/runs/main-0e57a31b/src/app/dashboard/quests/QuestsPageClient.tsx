"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import axios from "axios";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { buildPromptPackHref } from "@/lib/context-pack/href";
import { normalizeTopics } from "@/lib/topics";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleDashed,
  Copy,
  Edit2,
  Loader2,
  PauseCircle,
  Plus,
  Target,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

const QUEST_PAGE_SIZE = 10;

type QuestDifficulty = "easy" | "normal" | "hard" | "nightmare" | "hell";
type QuestStatus = "open" | "in_progress" | "blocked" | "done";
type QuestView = "all" | "active" | "in_progress" | "blocked" | "done";

interface Quest {
  id: string;
  goal: string;
  difficulty: QuestDifficulty;
  status: QuestStatus;
  area: string | null;
  topics: string[];
  completed: boolean;
  createdAt: string;
}

interface QuestApiPayload {
  _id?: string;
  id?: string;
  goal?: string;
  difficulty?: string;
  status?: QuestStatus;
  area?: string | null;
  topics?: string[];
  completed?: boolean;
  date?: string;
  createdAt?: string;
}

interface QuestApiResponse {
  quests?: QuestApiPayload[];
  meta?: {
    total?: number;
    loaded?: number;
    hasMore?: boolean;
    completed?: boolean;
    status?: QuestStatus;
    area?: string;
    statusCounts?: Partial<Record<QuestStatus, number>>;
  };
}

interface QuestSavedView {
  id: string;
  name: string;
  filters: {
    view?: QuestView;
    topic?: string;
    area?: string;
  };
}

const DIFFICULTY_OPTIONS: QuestDifficulty[] = ["easy", "normal", "hard", "nightmare", "hell"];
const STATUS_OPTIONS: QuestStatus[] = ["open", "in_progress", "blocked", "done"];

const DIFFICULTY_COLORS: Record<QuestDifficulty, string> = {
  easy: "bg-bg-panel text-text-secondary border-border",
  normal: "bg-bg-panel text-text-secondary border-border",
  hard: "bg-bg-panel text-text-secondary border-border",
  nightmare: "bg-bg-panel text-text-secondary border-border",
  hell: "bg-bg-panel text-text-secondary border-border",
};

const STATUS_LABELS: Record<QuestStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
};

const STATUS_ICONS: Record<QuestStatus, ReactNode> = {
  open: <CircleDashed className="h-3.5 w-3.5" />,
  in_progress: <Loader2 className="h-3.5 w-3.5" />,
  blocked: <PauseCircle className="h-3.5 w-3.5" />,
  done: <CheckCircle2 className="h-3.5 w-3.5" />,
};

const STATUS_TONE: Record<QuestStatus, string> = {
  open: "border-border bg-bg-panel text-text-secondary",
  in_progress: "border-status-info/30 bg-status-info/10 text-status-info",
  blocked: "border-status-warning/30 bg-status-warning/10 text-status-warning",
  done: "border-status-success/30 bg-status-success/10 text-status-success",
};

const STATUS_FILTERS: Array<{ value: QuestView; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

function toQuest(payload: QuestApiPayload): Quest {
  const completed = Boolean(payload.completed);
  const status = (payload.status || (completed ? "done" : "open")) as QuestStatus;

  return {
    id: String(payload._id || payload.id || ""),
    goal: String(payload.goal || ""),
    difficulty: (payload.difficulty as QuestDifficulty) || "normal",
    status,
    area: payload.area ? String(payload.area) : null,
    topics: Array.isArray(payload.topics) ? payload.topics.map((topic) => String(topic)) : [],
    completed,
    createdAt: String(payload.date || payload.createdAt || new Date().toISOString()),
  };
}

function filterQuestByView(quest: Quest, view: QuestView) {
  switch (view) {
    case "active":
      return !quest.completed;
    case "in_progress":
      return quest.status === "in_progress";
    case "blocked":
      return quest.status === "blocked";
    case "done":
      return quest.status === "done";
    default:
      return true;
  }
}

function statusCountForView(counts: Partial<Record<QuestStatus, number>>, view: QuestView) {
  switch (view) {
    case "active":
      return (counts.open || 0) + (counts.in_progress || 0) + (counts.blocked || 0);
    case "in_progress":
      return counts.in_progress || 0;
    case "blocked":
      return counts.blocked || 0;
    case "done":
      return counts.done || 0;
    default:
      return (counts.open || 0) + (counts.in_progress || 0) + (counts.blocked || 0) + (counts.done || 0);
  }
}

function QuestFormTopics({
  topics,
  topicInput,
  setTopics,
  setTopicInput,
  inputId,
}: {
  topics: string[];
  topicInput: string;
  setTopics: Dispatch<SetStateAction<string[]>>;
  setTopicInput: Dispatch<SetStateAction<string>>;
  inputId: string;
}) {
  const addTopicsToState = (
    inputValue: string,
    setter: Dispatch<SetStateAction<string[]>>,
    inputSetter: Dispatch<SetStateAction<string>>,
  ) => {
    const nextTopics = normalizeTopics(inputValue);
    if (nextTopics.length === 0) {
      inputSetter("");
      return;
    }

    setter((current) => normalizeTopics([...current, ...nextTopics]));
    inputSetter("");
  };

  const removeTopicFromState = (value: string, setter: Dispatch<SetStateAction<string[]>>) => {
    setter((current) => current.filter((topic) => topic !== value));
  };

  return (
    <div className="space-y-2">
      {topics.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {topics.map((topic) => (
            <span
              key={topic}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-panel px-2.5 py-1 text-[11px] font-medium text-text-secondary"
            >
              {topic}
              <button
                type="button"
                onClick={() => removeTopicFromState(topic, setTopics)}
                className="text-text-muted transition hover:text-white"
                aria-label={`Remove ${topic} topic`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          value={topicInput}
          onChange={(event) => setTopicInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTopicsToState(topicInput, setTopics, setTopicInput);
            }
          }}
          onBlur={() => addTopicsToState(topicInput, setTopics, setTopicInput)}
          placeholder="Add topic and press Enter"
          className="input-discord bg-bg-base/50 focus:bg-bg-base w-full"
        />
        <button
          type="button"
          onClick={() => addTopicsToState(topicInput, setTopics, setTopicInput)}
          className="matte-action-secondary"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function QuestCard({
  quest,
  editingId,
  editObjective,
  setEditObjective,
  editDifficultyLevel,
  setEditDifficultyLevel,
  editStatus,
  setEditStatus,
  editArea,
  setEditArea,
  editTopics,
  setEditTopics,
  editTopicInput,
  setEditTopicInput,
  startEditing,
  cancelEditing,
  saveEdit,
  deleteQuest,
  changeStatus,
  router,
}: {
  quest: Quest;
  editingId: string | null;
  editObjective: string;
  setEditObjective: Dispatch<SetStateAction<string>>;
  editDifficultyLevel: QuestDifficulty;
  setEditDifficultyLevel: Dispatch<SetStateAction<QuestDifficulty>>;
  editStatus: QuestStatus;
  setEditStatus: Dispatch<SetStateAction<QuestStatus>>;
  editArea: string;
  setEditArea: Dispatch<SetStateAction<string>>;
  editTopics: string[];
  setEditTopics: Dispatch<SetStateAction<string[]>>;
  editTopicInput: string;
  setEditTopicInput: Dispatch<SetStateAction<string>>;
  startEditing: (quest: Quest) => void;
  cancelEditing: () => void;
  saveEdit: (id: string) => Promise<void>;
  deleteQuest: (id: string) => Promise<void>;
  changeStatus: (id: string, status: QuestStatus) => Promise<void>;
  router: ReturnType<typeof useRouter>;
}) {
  const isEditing = editingId === quest.id;

  return (
    <article className={`matte-panel-muted p-4 transition-opacity duration-200 ${quest.completed ? "opacity-65" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        {isEditing ? (
          <div className="flex-1 space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr_8rem_10rem]">
              <input
                type="text"
                value={editObjective}
                onChange={(event) => setEditObjective(event.target.value)}
                className="input-discord text-sm py-1.5"
                autoFocus
              />
              <select
                value={editDifficultyLevel}
                onChange={(event) => setEditDifficultyLevel(event.target.value as QuestDifficulty)}
                className="input-discord cursor-pointer appearance-none text-sm py-1.5"
              >
                {DIFFICULTY_OPTIONS.map((difficulty) => (
                  <option key={difficulty} value={difficulty}>
                    {difficulty}
                  </option>
                ))}
              </select>
              <select
                value={editStatus}
                onChange={(event) => setEditStatus(event.target.value as QuestStatus)}
                className="input-discord cursor-pointer appearance-none text-sm py-1.5"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <input
              type="text"
              value={editArea}
              onChange={(event) => setEditArea(event.target.value)}
              placeholder="Area or module"
              className="input-discord text-sm py-1.5"
            />

            <QuestFormTopics
              topics={editTopics}
              topicInput={editTopicInput}
              setTopics={setEditTopics}
              setTopicInput={setEditTopicInput}
              inputId={`quest-edit-topics-${quest.id}`}
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void saveEdit(quest.id)}
                className="inline-flex items-center gap-1.5 rounded-md bg-status-success/20 px-3 py-1.5 text-xs font-semibold text-status-success transition-colors hover:bg-status-success/30"
              >
                <Check className="h-3.5 w-3.5" />
                Save
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                className="inline-flex items-center gap-1.5 rounded-md bg-bg-panel px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mr-4 flex-1 break-words border-r border-border/50 pr-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded border px-2 py-1 text-[10px] font-bold uppercase leading-none tracking-widest ${DIFFICULTY_COLORS[quest.difficulty]}`}>
                  {quest.difficulty}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[quest.status]}`}
                >
                  {STATUS_ICONS[quest.status]}
                  {STATUS_LABELS[quest.status]}
                </span>
                {quest.area ? (
                  <span className="rounded-full border border-border bg-bg-panel px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                    {quest.area}
                  </span>
                ) : null}
                <p className={`text-sm font-semibold ${quest.completed ? "text-text-muted line-through" : "text-text-primary"}`}>
                  {quest.goal}
                </p>
              </div>

              {quest.topics.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {quest.topics.map((topic) => (
                    <span
                      key={topic}
                      className={`rounded-full border border-border bg-bg-panel px-2.5 py-1 text-[11px] font-medium ${quest.completed ? "text-text-muted" : "text-text-secondary"}`}
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              ) : null}

              <p className="mt-2 text-xs text-text-muted">
                Created {new Date(quest.createdAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex min-w-[10rem] shrink-0 items-center justify-end gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-bg-panel/70 p-1">
                {STATUS_OPTIONS.map((status) => {
                  const isActive = quest.status === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => void changeStatus(quest.id, status)}
                      disabled={isActive}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:cursor-default disabled:opacity-60 ${
                        isActive
                          ? "bg-white text-black"
                          : "text-text-muted hover:bg-bg-base hover:text-white"
                      }`}
                      title={STATUS_LABELS[status]}
                      aria-label={`Set status to ${STATUS_LABELS[status]}`}
                    >
                      {STATUS_ICONS[status]}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => startEditing(quest)}
                className="rounded-md p-2 text-text-secondary transition-colors hover:bg-bg-panel hover:text-white"
                title="Edit quest"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => router.push(buildPromptPackHref("quest_focus", quest.id))}
                className="rounded-md p-2 text-text-secondary transition-colors hover:bg-bg-panel hover:text-white"
                title="Generate IDE Context"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void deleteQuest(quest.id)}
                className="rounded-md p-2 text-text-secondary transition-colors hover:bg-status-error/10 hover:text-status-error"
                title="Delete quest"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function QuestLogPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [openQuestItems, setOpenQuestItems] = useState<Quest[]>([]);
  const [completedQuestItems, setCompletedQuestItems] = useState<Quest[]>([]);
  const [objective, setObjective] = useState("");
  const [difficultyLevel, setDifficultyLevel] = useState<QuestDifficulty>("normal");
  const [statusLevel, setStatusLevel] = useState<QuestStatus>("open");
  const [area, setArea] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMoreOpen, setLoadingMoreOpen] = useState(false);
  const [loadingMoreCompleted, setLoadingMoreCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [togglingIds, setTogglingIds] = useState<string[]>([]);
  const [openHasMore, setOpenHasMore] = useState(false);
  const [completedHasMore, setCompletedHasMore] = useState(false);
  const [openLoadedCount, setOpenLoadedCount] = useState(0);
  const [completedLoadedCount, setCompletedLoadedCount] = useState(0);
  const [totalOpenCount, setTotalOpenCount] = useState(0);
  const [totalCompletedCount, setTotalCompletedCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Partial<Record<QuestStatus, number>>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editObjective, setEditObjective] = useState("");
  const [editDifficultyLevel, setEditDifficultyLevel] = useState<QuestDifficulty>("normal");
  const [editStatus, setEditStatus] = useState<QuestStatus>("open");
  const [editArea, setEditArea] = useState("");
  const [editTopics, setEditTopics] = useState<string[]>([]);
  const [editTopicInput, setEditTopicInput] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string>("all");
  const [selectedArea, setSelectedArea] = useState<string>("all");
  const [selectedView, setSelectedView] = useState<QuestView>("all");
  const [savedViews, setSavedViews] = useState<QuestSavedView[]>([]);
  const [savedViewName, setSavedViewName] = useState("");
  const [savingView, setSavingView] = useState(false);

  const quests = useMemo(() => [...openQuestItems, ...completedQuestItems], [completedQuestItems, openQuestItems]);
  const mergeQuestBatch = useCallback((current: Quest[], incoming: Quest[]) => {
    const merged = [...current];
    const seen = new Set(current.map((quest) => quest.id));

    for (const quest of incoming) {
      if (!seen.has(quest.id)) {
        merged.push(quest);
        seen.add(quest.id);
      }
    }

    return merged;
  }, []);

  const upsertQuest = useCallback((quest: Quest) => {
    const targetSetter = quest.completed ? setCompletedQuestItems : setOpenQuestItems;
    const otherSetter = quest.completed ? setOpenQuestItems : setCompletedQuestItems;

    otherSetter((current) => current.filter((item) => item.id !== quest.id));
    targetSetter((current) => {
      const next = current.some((item) => item.id === quest.id)
        ? current.map((item) => (item.id === quest.id ? quest : item))
        : [quest, ...current];

      return next.sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      );
    });
  }, []);

  const removeQuestFromLists = useCallback((id: string) => {
    setOpenQuestItems((current) => current.filter((quest) => quest.id !== id));
    setCompletedQuestItems((current) => current.filter((quest) => quest.id !== id));
  }, []);

  const fetchQuestBatch = useCallback(
    async (completed: boolean, opts?: { append?: boolean; skip?: number }) => {
      const append = Boolean(opts?.append);

      try {
        const setItems = completed ? setCompletedQuestItems : setOpenQuestItems;
        const setHasMore = completed ? setCompletedHasMore : setOpenHasMore;
        const setLoaded = completed ? setCompletedLoadedCount : setOpenLoadedCount;
        const setTotal = completed ? setTotalCompletedCount : setTotalOpenCount;

        if (append) {
          if (completed) {
            setLoadingMoreCompleted(true);
          } else {
            setLoadingMoreOpen(true);
          }
        } else {
          setLoading(true);
        }

        const response = await axios.get("/api/quests", {
          params: {
            withMeta: 1,
            completed,
            area: selectedArea === "all" ? undefined : selectedArea,
            limit: QUEST_PAGE_SIZE,
            skip: append ? opts?.skip ?? 0 : 0,
          },
        });

        const payload = response.data as QuestApiResponse;
        const mapped = Array.isArray(payload.quests) ? payload.quests.map(toQuest) : [];

        setItems((current) => (append ? mergeQuestBatch(current, mapped) : mapped));
        setLoaded((current) => (append ? current + mapped.length : mapped.length));
        setHasMore(Boolean(payload.meta?.hasMore));
        setTotal(Number(payload.meta?.total || 0));
        setStatusCounts(payload.meta?.statusCounts || {});
        setError("");
      } catch {
        setError("Unable to load quests.");
      } finally {
        if (append) {
          if (completed) {
            setLoadingMoreCompleted(false);
          } else {
            setLoadingMoreOpen(false);
          }
        } else {
          setLoading(false);
        }
      }
    },
    [mergeQuestBatch, selectedArea],
  );

  const fetchSavedViews = useCallback(async () => {
    try {
      const response = await axios.get("/api/views", {
        params: { surface: "quests" },
      });
      setSavedViews(Array.isArray(response.data?.views) ? response.data.views : []);
    } catch {
      setSavedViews([]);
    }
  }, []);

  useEffect(() => {
    void Promise.all([fetchQuestBatch(false), fetchQuestBatch(true)]);
  }, [fetchQuestBatch]);

  useEffect(() => {
    void fetchSavedViews();
  }, [fetchSavedViews]);

  useEffect(() => {
    const topic = searchParams.get("topic");
    const nextTopic = topic?.trim() || "all";
    if (nextTopic !== selectedTopic) {
      setSelectedTopic(nextTopic);
    }
  }, [searchParams, selectedTopic]);

  const areaOptions = useMemo(() => {
    const values = new Set<string>();
    quests.forEach((quest) => {
      if (quest.area) {
        values.add(quest.area);
      }
    });
    return Array.from(values).sort();
  }, [quests]);

  const topicOptions = useMemo(() => {
    const values = new Set<string>();
    quests.forEach((quest) => {
      quest.topics.forEach((topic) => values.add(topic));
    });
    return Array.from(values).sort();
  }, [quests]);

  useEffect(() => {
    if (selectedTopic !== "all" && !topicOptions.includes(selectedTopic)) {
      setSelectedTopic("all");
    }
  }, [selectedTopic, topicOptions]);

  useEffect(() => {
    if (selectedArea !== "all" && !areaOptions.includes(selectedArea)) {
      setSelectedArea("all");
    }
  }, [selectedArea, areaOptions]);

  const updateTopicFilter = useCallback(
    (nextTopic: string) => {
      setSelectedTopic(nextTopic);

      const params = new URLSearchParams(searchParams.toString());
      if (nextTopic === "all") {
        params.delete("topic");
      } else {
        params.set("topic", nextTopic);
      }

      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const applySavedView = useCallback(
    (view: QuestSavedView) => {
      const nextTopic = view.filters.topic || "all";
      const nextArea = view.filters.area || "all";
      const nextView = view.filters.view || "all";

      setSelectedArea(nextArea);
      setSelectedView(nextView);
      setSelectedTopic(nextTopic);

      const params = new URLSearchParams(searchParams.toString());
      if (nextTopic === "all") {
        params.delete("topic");
      } else {
        params.set("topic", nextTopic);
      }

      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const saveCurrentView = async () => {
    const name = savedViewName.trim();
    if (!name) return;

    try {
      setSavingView(true);
      const response = await axios.post("/api/views", {
        surface: "quests",
        name,
        filters: {
          view: selectedView,
          topic: selectedTopic,
          area: selectedArea,
        },
      });

      const nextView = response.data?.view;
      if (nextView?.id) {
        setSavedViews((current) => [nextView, ...current.filter((item) => item.id !== nextView.id)]);
      } else {
        await fetchSavedViews();
      }
      setSavedViewName("");
    } catch {
      setError("Unable to save view.");
    } finally {
      setSavingView(false);
    }
  };

  const removeSavedView = async (id: string) => {
    try {
      await axios.delete(`/api/views/${id}`);
      setSavedViews((current) => current.filter((view) => view.id !== id));
    } catch {
      setError("Unable to delete saved view.");
    }
  };

  const createQuest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const goal = objective.trim();
    if (!goal) return;

    try {
      setBusy(true);
      const response = await axios.post("/api/quests", {
        goal,
        difficulty: difficultyLevel,
        status: statusLevel,
        area,
        topics,
      });

      const created = response.data?.quest;
      if (created?._id) {
        const nextQuest = toQuest(created);
        upsertQuest(nextQuest);
        setStatusCounts((current) => ({
          ...current,
          [nextQuest.status]: (current[nextQuest.status] || 0) + 1,
        }));
        if (nextQuest.completed) {
          setTotalCompletedCount((current) => current + 1);
          setCompletedLoadedCount((current) => current + 1);
        } else {
          setTotalOpenCount((current) => current + 1);
          setOpenLoadedCount((current) => current + 1);
        }
      }

      setObjective("");
      setDifficultyLevel("normal");
      setStatusLevel("open");
      setArea("");
      setTopics([]);
      setTopicInput("");
      setError("");
    } catch {
      setError("Unable to create quest.");
    } finally {
      setBusy(false);
    }
  };

  const toggleQuest = async (id: string) => {
    if (togglingIds.includes(id)) {
      return;
    }

    try {
      setTogglingIds((current) => [...current, id]);
      const existing = quests.find((quest) => quest.id === id);
      const response = await axios.put(`/api/quests/${id}/complete`);
      const updated = response.data?.quest;

      if (updated?._id || updated?.id) {
        const nextQuest = toQuest(updated);
        upsertQuest(nextQuest);

        if (existing && existing.status !== nextQuest.status) {
          setStatusCounts((current) => ({
            ...current,
            [existing.status]: Math.max(0, (current[existing.status] || 0) - 1),
            [nextQuest.status]: (current[nextQuest.status] || 0) + 1,
          }));
        }

        if (nextQuest.completed) {
          setTotalOpenCount((current) => Math.max(0, current - 1));
          setTotalCompletedCount((current) => current + 1);
          setCompletedLoadedCount((current) => current + 1);
        } else {
          setTotalCompletedCount((current) => Math.max(0, current - 1));
          setTotalOpenCount((current) => current + 1);
          setOpenLoadedCount((current) => current + 1);
        }
      }

      setError("");
    } catch {
      setError("Unable to update quest.");
    } finally {
      setTogglingIds((current) => current.filter((questId) => questId !== id));
    }
  };

  const changeStatus = async (id: string, status: QuestStatus) => {
    if (togglingIds.includes(id)) {
      return;
    }

    try {
      setTogglingIds((current) => [...current, id]);
      const existing = quests.find((quest) => quest.id === id);
      if (!existing) {
        return;
      }

      const response = await axios.put(`/api/quests/${id}`, {
        goal: existing.goal,
        difficulty: existing.difficulty,
        topics: existing.topics,
        area: existing.area || "",
        status,
      });
      const updated = response.data?.quest;

      if (updated?._id || updated?.id) {
        const nextQuest = toQuest(updated);
        upsertQuest(nextQuest);

        if (existing && existing.status !== nextQuest.status) {
          setStatusCounts((current) => ({
            ...current,
            [existing.status]: Math.max(0, (current[existing.status] || 0) - 1),
            [nextQuest.status]: (current[nextQuest.status] || 0) + 1,
          }));
        }

        if (existing && existing.completed !== nextQuest.completed) {
          if (nextQuest.completed) {
            setTotalOpenCount((current) => Math.max(0, current - 1));
            setTotalCompletedCount((current) => current + 1);
            setCompletedLoadedCount((current) => current + 1);
          } else {
            setTotalCompletedCount((current) => Math.max(0, current - 1));
            setTotalOpenCount((current) => current + 1);
            setOpenLoadedCount((current) => current + 1);
          }
        }
      }

      setError("");
    } catch {
      setError("Unable to change quest status.");
    } finally {
      setTogglingIds((current) => current.filter((questId) => questId !== id));
    }
  };

  const deleteQuest = async (id: string) => {
    try {
      const existing = quests.find((quest) => quest.id === id);
      await axios.delete(`/api/quests/${id}`);
      removeQuestFromLists(id);
      if (existing) {
        setStatusCounts((current) => ({
          ...current,
          [existing.status]: Math.max(0, (current[existing.status] || 0) - 1),
        }));
        if (existing.completed) {
          setTotalCompletedCount((current) => Math.max(0, current - 1));
          setCompletedLoadedCount((current) => Math.max(0, current - 1));
        } else {
          setTotalOpenCount((current) => Math.max(0, current - 1));
          setOpenLoadedCount((current) => Math.max(0, current - 1));
        }
      }
      setError("");
    } catch {
      setError("Unable to delete quest.");
    }
  };

  const startEditing = (quest: Quest) => {
    setEditingId(quest.id);
    setEditObjective(quest.goal);
    setEditDifficultyLevel(quest.difficulty);
    setEditStatus(quest.status);
    setEditArea(quest.area || "");
    setEditTopics(quest.topics);
    setEditTopicInput("");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditObjective("");
    setEditDifficultyLevel("normal");
    setEditStatus("open");
    setEditArea("");
    setEditTopics([]);
    setEditTopicInput("");
  };

  const saveEdit = async (id: string) => {
    if (!editObjective.trim()) return;

    try {
      const existing = quests.find((quest) => quest.id === id);
      const response = await axios.put(`/api/quests/${id}`, {
        goal: editObjective.trim(),
        difficulty: editDifficultyLevel,
        status: editStatus,
        area: editArea,
        topics: editTopics,
      });

      const updated = response.data?.quest;
      if (updated?._id || updated?.id) {
        const nextQuest = toQuest(updated);
        upsertQuest(nextQuest);
        if (existing && existing.status !== nextQuest.status) {
          setStatusCounts((current) => ({
            ...current,
            [existing.status]: Math.max(0, (current[existing.status] || 0) - 1),
            [nextQuest.status]: (current[nextQuest.status] || 0) + 1,
          }));
        }
      }
      cancelEditing();
      setError("");
    } catch {
      setError("Unable to update quest.");
    }
  };

  const filteredOpenQuests = useMemo(
    () =>
      openQuestItems.filter(
        (quest) =>
          (selectedTopic === "all" || quest.topics.includes(selectedTopic)) &&
          filterQuestByView(quest, selectedView),
      ),
    [openQuestItems, selectedTopic, selectedView],
  );

  const filteredCompletedQuests = useMemo(
    () =>
      completedQuestItems.filter(
        (quest) =>
          (selectedTopic === "all" || quest.topics.includes(selectedTopic)) &&
          filterQuestByView(quest, selectedView),
      ),
    [completedQuestItems, selectedTopic, selectedView],
  );

  const totalCount = totalOpenCount + totalCompletedCount;
  const totalVisibleCount = statusCountForView(statusCounts, selectedView);

  return (
    <div className="matte-page mx-auto w-full max-w-5xl animate-fade-in pb-10 text-text-primary">
      <header className="matte-page-header">
        <div className="flex items-center gap-3">
          <div className="matte-icon-frame">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <h1 className="matte-page-title">Quest</h1>
            <p className="mt-1 matte-panel-copy">
              Structured work queue. Showing {openQuestItems.length + completedQuestItems.length} of {totalCount}, current view {totalVisibleCount}.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedArea}
            onChange={(event) => setSelectedArea(event.target.value)}
            className="input-discord bg-bg-base/50 focus:bg-bg-base w-[10rem] cursor-pointer appearance-none text-sm py-2 px-3"
          >
            <option value="all">All areas</option>
            {areaOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={selectedTopic}
            onChange={(event) => updateTopicFilter(event.target.value)}
            className="input-discord bg-bg-base/50 focus:bg-bg-base w-[10rem] cursor-pointer appearance-none text-sm py-2 px-3"
          >
            <option value="all">All topics</option>
            {topicOptions.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => router.push(buildPromptPackHref("quest_focus"))}
            className="matte-action-secondary whitespace-nowrap"
          >
            <Copy className="h-4 w-4" />
            Generate Task
          </button>
        </div>
      </header>
      <section className="matte-panel p-5">
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {savedViews.map((view) => (
              <div
                key={view.id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-panel px-2.5 py-1 text-[11px] font-medium text-text-secondary"
              >
                <button
                  type="button"
                  onClick={() => applySavedView(view)}
                  className="transition hover:text-white"
                >
                  {view.name}
                </button>
                <button
                  type="button"
                  onClick={() => void removeSavedView(view.id)}
                  className="text-text-muted transition hover:text-white"
                  aria-label={`Delete ${view.name} view`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={savedViewName}
              onChange={(event) => setSavedViewName(event.target.value)}
              placeholder="Save current view"
              className="input-discord bg-bg-base/50 focus:bg-bg-base w-full sm:w-[16rem]"
            />
            <button
              type="button"
              onClick={() => void saveCurrentView()}
              disabled={savingView || !savedViewName.trim()}
              className="matte-action-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingView ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Save View
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setSelectedView(filter.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedView === filter.value
                  ? "border-text-primary bg-bg-panel text-text-primary"
                  : "border-border bg-bg-base/30 text-text-secondary hover:text-white"
              }`}
            >
              {filter.label}
              <span className="ml-2 text-text-muted">{statusCountForView(statusCounts, filter.value)}</span>
            </button>
          ))}
        </div>

        <h2 className="mb-3 matte-section-title">Create Quest</h2>
        <form onSubmit={createQuest} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_8rem_10rem]">
            <div>
              <label htmlFor="quest-objective" className="mb-2 block matte-section-title">
                Objective
              </label>
              <input
                id="quest-objective"
                type="text"
                value={objective}
                maxLength={100}
                onChange={(event) => setObjective(event.target.value)}
                placeholder="Define your objective"
                className="input-discord bg-bg-base/50 focus:bg-bg-base w-full"
              />
            </div>
            <div>
              <label htmlFor="quest-difficulty" className="mb-2 block matte-section-title">
                Difficulty
              </label>
              <select
                id="quest-difficulty"
                value={difficultyLevel}
                onChange={(event) => setDifficultyLevel(event.target.value as QuestDifficulty)}
                className="input-discord bg-bg-base/50 focus:bg-bg-base w-full cursor-pointer appearance-none text-sm py-2 px-3"
              >
                {DIFFICULTY_OPTIONS.map((difficulty) => (
                  <option key={difficulty} value={difficulty}>
                    {difficulty}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="quest-status" className="mb-2 block matte-section-title">
                Status
              </label>
              <select
                id="quest-status"
                value={statusLevel}
                onChange={(event) => setStatusLevel(event.target.value as QuestStatus)}
                className="input-discord bg-bg-base/50 focus:bg-bg-base w-full cursor-pointer appearance-none text-sm py-2 px-3"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="quest-area" className="mb-2 block matte-section-title">
              Area
            </label>
            <input
              id="quest-area"
              type="text"
              value={area}
              onChange={(event) => setArea(event.target.value)}
                placeholder="automation, graph, task-gen"
              className="input-discord bg-bg-base/50 focus:bg-bg-base w-full"
            />
          </div>

          <div>
            <label htmlFor="quest-topics" className="mb-2 block matte-section-title">
              Topics
            </label>
            <QuestFormTopics
              topics={topics}
              topicInput={topicInput}
              setTopics={setTopics}
              setTopicInput={setTopicInput}
              inputId="quest-topics"
            />
          </div>

          <button
            type="submit"
            disabled={busy || !objective.trim()}
            className="matte-action-primary mt-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add Quest
          </button>
        </form>
      </section>

      {error ? (
        <p className="matte-panel-muted px-4 py-3 text-sm text-text-secondary">
          <AlertTriangle className="mr-2 inline h-4 w-4" />
          {error}
        </p>
      ) : null}

      <section className="space-y-5">
        {loading ? (
          <div className="matte-panel flex items-center justify-center py-10 text-text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2 text-sm">Loading quests...</span>
          </div>
        ) : totalCount === 0 ? (
          <div className="matte-empty py-10 text-center">
            <p className="text-sm text-text-secondary">No quests yet.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="matte-section-title">Active Quests</div>
              {filteredOpenQuests.length === 0 ? (
                <div className="matte-empty py-6 text-center">
                  <p className="text-sm text-text-secondary">No active quests in this view.</p>
                </div>
              ) : (
                filteredOpenQuests.map((quest) => (
                  <QuestCard
                    key={quest.id}
                    quest={quest}
                    editingId={editingId}
                    editObjective={editObjective}
                    setEditObjective={setEditObjective}
                    editDifficultyLevel={editDifficultyLevel}
                    setEditDifficultyLevel={setEditDifficultyLevel}
                    editStatus={editStatus}
                    setEditStatus={setEditStatus}
                    editArea={editArea}
                    setEditArea={setEditArea}
                    editTopics={editTopics}
                    setEditTopics={setEditTopics}
                    editTopicInput={editTopicInput}
                    setEditTopicInput={setEditTopicInput}
                    startEditing={startEditing}
                    cancelEditing={cancelEditing}
                    saveEdit={saveEdit}
              deleteQuest={deleteQuest}
              changeStatus={changeStatus}
              router={router}
            />
                ))
              )}
              {openHasMore ? (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => void fetchQuestBatch(false, { append: true, skip: openLoadedCount })}
                    disabled={loadingMoreOpen}
                    className="matte-action-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingMoreOpen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    See More
                  </button>
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="matte-section-title">Done</div>
              {filteredCompletedQuests.length === 0 ? (
                <div className="matte-empty py-6 text-center">
                  <p className="text-sm text-text-secondary">No done quests in this view.</p>
                </div>
              ) : (
                filteredCompletedQuests.map((quest) => (
                  <QuestCard
                    key={quest.id}
                    quest={quest}
                    editingId={editingId}
                    editObjective={editObjective}
                    setEditObjective={setEditObjective}
                    editDifficultyLevel={editDifficultyLevel}
                    setEditDifficultyLevel={setEditDifficultyLevel}
                    editStatus={editStatus}
                    setEditStatus={setEditStatus}
                    editArea={editArea}
                    setEditArea={setEditArea}
                    editTopics={editTopics}
                    setEditTopics={setEditTopics}
                    editTopicInput={editTopicInput}
                    setEditTopicInput={setEditTopicInput}
                    startEditing={startEditing}
                    cancelEditing={cancelEditing}
                    saveEdit={saveEdit}
                    deleteQuest={deleteQuest}
                    changeStatus={changeStatus}
                    router={router}
                  />
                ))
              )}
              {completedHasMore ? (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => void fetchQuestBatch(true, { append: true, skip: completedLoadedCount })}
                    disabled={loadingMoreCompleted}
                    className="matte-action-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingMoreCompleted ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    See More
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default function QuestsPageClient() {
  return <QuestLogPageContent />;
}
