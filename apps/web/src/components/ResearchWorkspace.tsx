import { useMemo, useState } from "react";
import type { ResearchTaskRecord, ValidationFindingRecord, ValidationFindingStatus } from "../lib/api";
import { getPersonDisplayLabel } from "../lib/personDisplay";
import type { Person } from "../lib/api";

type Props = {
  people: Person[];
  tasks: ResearchTaskRecord[];
  findings: ValidationFindingRecord[];
  tasksLoading: boolean;
  findingsLoading: boolean;
  validationEngineDisabled: boolean;
  onRefreshTasks: () => Promise<void>;
  onRecomputeFindings: () => Promise<void>;
  onTaskUpdate: (
    taskId: string,
    patch: Partial<Pick<ResearchTaskRecord, "status" | "dueDate">>
  ) => Promise<void>;
  onTaskDelete: (taskId: string) => Promise<void>;
  onFindingStatusChange: (findingId: string, status: "OPEN" | "IN_PROGRESS" | "DISMISSED") => Promise<void>;
  onOpenPerson: (personId: string) => void;
};

const activeTaskStatuses = new Set(["OPEN", "IN_PROGRESS"]);
const activeFindingStatuses = new Set<ValidationFindingStatus>(["OPEN", "IN_PROGRESS"]);

const personName = (people: Person[], personId: string | null | undefined) => {
  if (!personId) {
    return "Global";
  }
  const person = people.find((p) => p.id === personId);
  return person ? getPersonDisplayLabel(person) : personId;
};

const openPersonIdForFinding = (finding: ValidationFindingRecord) =>
  finding.personId ??
  finding.relatedPersonId ??
  finding.display.relationship?.fromPersonId ??
  finding.display.relationship?.toPersonId ??
  null;

export const ResearchWorkspace = ({
  people,
  tasks,
  findings,
  tasksLoading,
  findingsLoading,
  validationEngineDisabled,
  onRefreshTasks,
  onRecomputeFindings,
  onTaskUpdate,
  onTaskDelete,
  onFindingStatusChange,
  onOpenPerson
}: Props) => {
  const [taskStatusFilter, setTaskStatusFilter] = useState<"ACTIVE" | "ALL">("ACTIVE");
  const [findingStatusFilter, setFindingStatusFilter] = useState<"ACTIVE" | "ALL">("ACTIVE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleTasks = useMemo(
    () =>
      [...tasks]
        .filter((task) => taskStatusFilter === "ALL" || activeTaskStatuses.has(task.status))
        .sort(
          (left, right) =>
            left.status.localeCompare(right.status) ||
            (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31")
        ),
    [taskStatusFilter, tasks]
  );

  const visibleFindings = useMemo(
    () =>
      findings.filter(
        (finding) => findingStatusFilter === "ALL" || activeFindingStatuses.has(finding.status)
      ),
    [findingStatusFilter, findings]
  );

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Research action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="workspace-main-stack workspace-main-stack--secondary">
      <section className="card stack workspace-intro-card">
        <div className="stack">
          <h2>Research workspace</h2>
          <p className="hint">Review open research tasks and persisted validation issues across the tree.</p>
        </div>
        {error ? <p className="hint hint--danger">{error}</p> : null}
        {validationEngineDisabled ? (
          <p className="hint hint--danger">
            Validation engine is disabled. Stored findings remain visible, but recompute is unavailable.
          </p>
        ) : null}
        <div className="workspace-action-row">
          <span className="status-pill">Tasks: {visibleTasks.length}</span>
          <span className="status-pill">Issues: {visibleFindings.length}</span>
          <button
            type="button"
            className="secondary-button workspace-action-button"
            disabled={busy || validationEngineDisabled}
            onClick={() => void wrap(onRecomputeFindings)}
          >
            Recompute validation
          </button>
          <button
            type="button"
            className="secondary-button workspace-action-button"
            disabled={busy}
            onClick={() => void wrap(onRefreshTasks)}
          >
            Refresh tasks
          </button>
        </div>
      </section>

      <section className="card stack workspace-intro-card">
        <div className="workspace-action-row">
          <h3>Research tasks</h3>
          <select
            value={taskStatusFilter}
            onChange={(event) => setTaskStatusFilter(event.target.value as "ACTIVE" | "ALL")}
          >
            <option value="ACTIVE">Open and in progress</option>
            <option value="ALL">All statuses</option>
          </select>
        </div>
        {tasksLoading ? <p className="hint">Loading tasks...</p> : null}
        {!tasksLoading && visibleTasks.length === 0 ? (
          <p className="hint">No matching research tasks.</p>
        ) : null}
        <ul className="research-task-list">
          {visibleTasks.map((task) => (
            <li key={task.id} className="research-task-item">
              <select
                value={task.status}
                disabled={busy}
                onChange={(event) =>
                  void wrap(() =>
                    onTaskUpdate(task.id, { status: event.target.value as ResearchTaskRecord["status"] })
                  )
                }
              >
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="DONE">DONE</option>
              </select>
              <span className="research-task-title">{task.title}</span>
              <span className="hint research-task-meta">{personName(people, task.personId)}</span>
              <input
                className="research-task-due-input"
                type="date"
                value={task.dueDate ?? ""}
                disabled={busy}
                onChange={(event) =>
                  void wrap(() => onTaskUpdate(task.id, { dueDate: event.target.value || null }))
                }
              />
              {task.personId ? (
                <button
                  type="button"
                  className="text-link-button"
                  onClick={() => onOpenPerson(task.personId!)}
                >
                  Open person
                </button>
              ) : null}
              <button
                type="button"
                className="text-link-button"
                disabled={busy}
                onClick={() => void wrap(() => onTaskDelete(task.id))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack workspace-intro-card">
        <div className="workspace-action-row">
          <h3>Validation issues</h3>
          <select
            value={findingStatusFilter}
            onChange={(event) => setFindingStatusFilter(event.target.value as "ACTIVE" | "ALL")}
          >
            <option value="ACTIVE">Open and in progress</option>
            <option value="ALL">All statuses</option>
          </select>
        </div>
        {findingsLoading ? <p className="hint">Loading validation findings...</p> : null}
        {!findingsLoading && visibleFindings.length === 0 ? (
          <p className="hint">No matching validation issues.</p>
        ) : null}
        <ul className="research-task-list">
          {visibleFindings.map((finding) => {
            const openPersonId = openPersonIdForFinding(finding);
            return (
              <li key={finding.id} className="research-task-item">
                <span className="status-pill">{finding.severity}</span>
                <strong>{finding.code}</strong>
                <span>{finding.message}</span>
                <span className="hint research-task-meta">
                  {finding.display.person?.label ??
                    finding.display.relatedPerson?.label ??
                    finding.display.relationship?.label ??
                    finding.display.family?.label ??
                    "Tree-wide"}
                </span>
                {openPersonId ? (
                  <button
                    type="button"
                    className="text-link-button"
                    onClick={() => onOpenPerson(openPersonId)}
                  >
                    Open person
                  </button>
                ) : null}
                {finding.status !== "IN_PROGRESS" ? (
                  <button
                    type="button"
                    className="text-link-button"
                    disabled={busy}
                    onClick={() => void wrap(() => onFindingStatusChange(finding.id, "IN_PROGRESS"))}
                  >
                    Mark in progress
                  </button>
                ) : null}
                {finding.status === "DISMISSED" ? (
                  <button
                    type="button"
                    className="text-link-button"
                    disabled={busy}
                    onClick={() => void wrap(() => onFindingStatusChange(finding.id, "OPEN"))}
                  >
                    Reopen
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-link-button"
                    disabled={busy}
                    onClick={() => void wrap(() => onFindingStatusChange(finding.id, "DISMISSED"))}
                  >
                    Dismiss
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
};
