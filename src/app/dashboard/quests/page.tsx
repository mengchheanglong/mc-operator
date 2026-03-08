"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { buildPromptPackHref } from "@/lib/context-pack/href";
import { Check, CheckCircle2, Edit2, Loader2, Plus, Target, Trash2, Undo2, X, Copy } from "lucide-react";

const DIFFICULTY_COLORS = {
  easy: "bg-bg-panel text-text-secondary border-border",
  normal: "bg-bg-panel text-text-secondary border-border",
  hard: "bg-bg-panel text-text-secondary border-border",
  nightmare: "bg-bg-panel text-text-secondary border-border",
  hell: "bg-bg-panel text-text-secondary border-border",
};

interface Quest {
  id: string;
  goal: string;
  difficulty: 'easy' | 'normal' | 'hard' | 'nightmare' | 'hell';
  completed: boolean;
  createdAt: string;
}

export default function QuestLogPage() {
  const router = useRouter();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [objective, setObjective] = useState("");
  const [difficultyLevel, setDifficultyLevel] = useState<'easy' | 'normal' | 'hard' | 'nightmare' | 'hell'>('normal');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editObjective, setEditObjective] = useState("");
  const [editDifficultyLevel, setEditDifficultyLevel] = useState<'easy' | 'normal' | 'hard' | 'nightmare' | 'hell'>('normal');

  const pendingCount = useMemo(() => quests.filter((quest) => !quest.completed).length, [quests]);

  const fetchQuests = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get("/api/quests");
      const mapped = (Array.isArray(response.data) ? response.data : []).map(
        (quest: {
          _id: string;
          goal: string;
          difficulty?: string;
          completed?: boolean;
          date?: string;
          createdAt?: string;
        }) => ({
          id: quest._id,
          goal: String(quest.goal || ""),
          difficulty: (quest.difficulty as any) || "normal",
          completed: Boolean(quest.completed),
          createdAt: String(quest.date || quest.createdAt || new Date().toISOString()),
        }),
      );

      setQuests(mapped);
      setError("");
    } catch {
      setError("Unable to load quests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQuests();
  }, [fetchQuests]);

  const createQuest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const goal = objective.trim();
    if (!goal) return;

    try {
      setBusy(true);
      const response = await axios.post("/api/quests", { goal, difficulty: difficultyLevel });

      const created = response.data?.quest;
      if (created?._id) {
        setQuests((current) => [
          {
            id: String(created._id),
            goal: String(created.goal || goal),
            difficulty: created.difficulty || difficultyLevel,
            completed: Boolean(created.completed),
            createdAt: String(created.date || new Date().toISOString()),
          },
          ...current,
        ]);
      }

      setObjective("");
      setDifficultyLevel("normal");
      setError("");
    } catch {
      setError("Unable to create quest.");
    } finally {
      setBusy(false);
    }
  };

  const toggleQuest = async (id: string) => {
    try {
      const response = await axios.put(`/api/quests/${id}/complete`);
      if (response.data?.deleted) {
        setQuests((current) => current.filter((quest) => quest.id !== id));
        return;
      }

      const updated = response.data?.quest;
      if (updated?._id || updated?.id) {
        const updatedId = String(updated._id || updated.id);
        setQuests((current) =>
          current.map((quest) =>
            quest.id === updatedId
              ? {
                  ...quest,
                  completed: Boolean(updated.completed),
                }
              : quest,
          ),
        );
      }

      setError("");
    } catch {
      setError("Unable to update quest.");
    }
  };

  const deleteQuest = async (id: string) => {
    try {
      await axios.delete(`/api/quests/${id}`);
      setQuests((current) => current.filter((quest) => quest.id !== id));
      setError("");
    } catch {
      setError("Unable to delete quest.");
    }
  };

  const startEditing = (quest: Quest) => {
    setEditingId(quest.id);
    setEditObjective(quest.goal);
    setEditDifficultyLevel(quest.difficulty);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditObjective("");
    setEditDifficultyLevel("normal");
  };

  const saveEdit = async (id: string) => {
    if (!editObjective.trim()) return;

    try {
      const response = await axios.put(`/api/quests/${id}`, {
        goal: editObjective.trim(),
        difficulty: editDifficultyLevel,
      });

      const updated = response.data?.quest;
      if (updated?._id || updated?.id) {
        setQuests((current) =>
          current.map((quest) =>
            quest.id === id
              ? {
                  ...quest,
                  goal: updated.goal || editObjective.trim(),
                  difficulty: updated.difficulty || editDifficultyLevel,
                }
              : quest
          )
        );
      }
      cancelEditing();
      setError("");
    } catch {
      setError("Unable to update quest.");
    }
  };

  const orderedQuests = useMemo(
    () =>
      [...quests].sort((a, b) => {
        if (a.completed !== b.completed) {
          return Number(a.completed) - Number(b.completed);
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [quests],
  );

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
              Objective-only quest board. Total {quests.length}, pending {pendingCount}.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(buildPromptPackHref("quest_focus"))}
            className="matte-action-secondary"
          >
            <Copy className="h-4 w-4" />
            Build Prompt Pack
          </button>
        </div>
      </header>

      <section className="matte-panel p-5">
        <h2 className="mb-3 matte-section-title">Create Quest</h2>
        <form onSubmit={createQuest} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
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
            <div className="w-full sm:w-32">
              <label htmlFor="quest-difficulty" className="mb-2 block matte-section-title">
                Difficulty
              </label>
              <select
                id="quest-difficulty"
                value={difficultyLevel}
                onChange={(event) => setDifficultyLevel(event.target.value as any)}
                className="input-discord bg-bg-base/50 focus:bg-bg-base w-full cursor-pointer appearance-none text-sm py-2 px-3"
              >
                <option value="easy">Easy</option>
                <option value="normal">Normal</option>
                <option value="hard">Hard</option>
                <option value="nightmare">Nightmare</option>
                <option value="hell">Hell</option>
              </select>
            </div>
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

      {error && (
        <p className="matte-panel-muted px-4 py-3 text-sm text-text-secondary">
          {error}
        </p>
      )}

      <section className="space-y-3">
        {loading ? (
          <div className="matte-panel flex items-center justify-center py-10 text-text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2 text-sm">Loading quests...</span>
          </div>
        ) : orderedQuests.length === 0 ? (
          <div className="matte-empty py-10 text-center">
            <p className="text-sm text-text-secondary">No quests yet.</p>
          </div>
        ) : (
          orderedQuests.map((quest) => (
            <article key={quest.id} className={`matte-panel-muted p-4 transition-all ${quest.completed ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                {editingId === quest.id ? (
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                       <input
                          type="text"
                          value={editObjective}
                          onChange={(e) => setEditObjective(e.target.value)}
                          className="input-discord flex-1 text-sm py-1.5"
                          autoFocus
                       />
                       <select
                          value={editDifficultyLevel}
                          onChange={(e) => setEditDifficultyLevel(e.target.value as any)}
                          className="input-discord text-sm py-1.5 cursor-pointer appearance-none sm:w-32"
                       >
                          <option value="easy">Easy</option>
                          <option value="normal">Normal</option>
                          <option value="hard">Hard</option>
                          <option value="nightmare">Nightmare</option>
                          <option value="hell">Hell</option>
                       </select>
                    </div>
                    <div className="flex items-center gap-2">
                       <button onClick={() => void saveEdit(quest.id)} className="inline-flex items-center gap-1.5 rounded-md bg-status-success/20 text-status-success px-3 py-1.5 text-xs font-semibold hover:bg-status-success/30 transition-colors">
                          <Check className="h-3.5 w-3.5" /> Save
                       </button>
                       <button onClick={cancelEditing} className="inline-flex items-center gap-1.5 rounded-md bg-bg-panel text-text-secondary px-3 py-1.5 text-xs font-semibold hover:text-white transition-colors">
                          <X className="h-3.5 w-3.5" /> Cancel
                       </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 flex-1 break-words mr-4 border-r border-border/50 pr-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 leading-none rounded border ${DIFFICULTY_COLORS[quest.difficulty] || DIFFICULTY_COLORS.normal}`}>
                          {quest.difficulty}
                        </span>
                        <p className={["text-sm font-semibold", quest.completed ? "text-text-muted line-through" : "text-text-primary"].join(" ")}>
                          {quest.goal}
                        </p>
                      </div>
                      <p className="text-xs text-text-muted">
                        Created {new Date(quest.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                      {quest.completed ? (
                        <button
                          type="button"
                          onClick={() => void toggleQuest(quest.id)}
                          className="rounded-md p-2 text-status-warning transition-colors hover:bg-status-warning/10"
                          title="Reopen quest"
                        >
                          <Undo2 className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void toggleQuest(quest.id)}
                          className="rounded-md p-2 text-status-success transition-colors hover:bg-status-success/10"
                          title="Mark as done"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      {!quest.completed && (
                        <>
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
                        </>
                      )}
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
          ))
        )}
      </section>
    </div>
  );
}
