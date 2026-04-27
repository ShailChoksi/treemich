/**
 * @file Research tasks: create list items, optional global tasks.
 */

import {
  researchTaskStatusValues,
  type CreateResearchTaskBody,
  type ResearchTaskStatus
} from "@treemich/shared";
import { useMemo, useState } from "react";
import type { ResearchTaskRecord } from "../../lib/api";

type Props = {
  personId: string;
  tasks: ResearchTaskRecord[] | undefined;
  disabled?: boolean;
  onCreate: (body: CreateResearchTaskBody) => Promise<void>;
  onUpdate: (
    taskId: string,
    patch: Partial<Pick<ResearchTaskRecord, "title" | "status" | "dueDate" | "notes" | "immichPersonId">>
  ) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
};

export const ResearchTasksSection = ({ personId, tasks, disabled, onCreate, onUpdate, onDelete }: Props) => {
  const [busy, setBusy] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [createGlobal, setCreateGlobal] = useState(false);

  const sortedTasks = useMemo(
    () =>
      [...(tasks ?? [])].sort(
        (left, right) =>
          left.status.localeCompare(right.status) ||
          (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31")
      ),
    [tasks]
  );

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  if (tasks === undefined) {
    return (
      <div className="skeleton-card sidebar-skeleton" aria-label="Loading research tasks">
        <span className="sr-only">Loading research tasks…</span>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="research-task-create">
        <input
          className="research-task-input"
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          placeholder="Add a research task title"
          disabled={disabled || busy}
        />
        <input
          className="research-task-input"
          type="date"
          value={newDueDate}
          onChange={(event) => setNewDueDate(event.target.value)}
          disabled={disabled || busy}
        />
        <textarea
          className="research-task-notes-input"
          value={newNotes}
          onChange={(event) => setNewNotes(event.target.value)}
          placeholder="Optional notes"
          rows={2}
          disabled={disabled || busy}
        />
        <label className="research-task-scope-toggle">
          <input
            type="checkbox"
            checked={createGlobal}
            onChange={(event) => setCreateGlobal(event.target.checked)}
            disabled={disabled || busy}
          />
          Create as global task (not person-specific)
        </label>
        <button
          type="button"
          className="secondary-button"
          disabled={disabled || busy || newTitle.trim().length === 0}
          onClick={() =>
            void wrap(async () => {
              await onCreate({
                title: newTitle.trim(),
                status: "OPEN",
                immichPersonId: createGlobal ? null : personId,
                dueDate: newDueDate || null,
                notes: newNotes.trim() ? newNotes.trim() : null
              });
              setNewTitle("");
              setNewDueDate("");
              setNewNotes("");
              setCreateGlobal(false);
            })
          }
        >
          Add task
        </button>
      </div>
      <ul className="research-task-list">
        {sortedTasks.map((task) => (
          <li key={task.id} className="research-task-item">
            <select
              value={task.status}
              disabled={disabled || busy}
              onChange={(event) =>
                void wrap(() => onUpdate(task.id, { status: event.target.value as ResearchTaskStatus }))
              }
            >
              {researchTaskStatusValues.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <span className="research-task-title">{task.title}</span>
            <input
              className="research-task-due-input"
              type="date"
              value={task.dueDate ?? ""}
              disabled={disabled || busy}
              onChange={(event) =>
                void wrap(() => onUpdate(task.id, { dueDate: event.target.value || null }))
              }
            />
            <button
              type="button"
              className="text-link-button"
              disabled={disabled || busy}
              onClick={() => void wrap(() => onDelete(task.id))}
            >
              Remove
            </button>
            {task.immichPersonId == null ? <span className="hint research-task-meta">Global</span> : null}
            {task.notes ? <p className="hint research-task-meta">{task.notes}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
};
