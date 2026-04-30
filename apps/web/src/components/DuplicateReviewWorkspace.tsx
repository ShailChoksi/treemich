import { useEffect, useMemo, useState } from "react";
import type { PersonDuplicateCandidateRecord } from "../lib/api";

type Props = {
  candidates: PersonDuplicateCandidateRecord[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onRecompute: () => Promise<void>;
  onDismiss: (candidateId: string) => Promise<void>;
  onMerge: (candidateId: string, canonicalPersonId: string, duplicatePersonId: string) => Promise<void>;
  onOpenPerson: (personId: string) => void;
};

const formatPersonMeta = (person: PersonDuplicateCandidateRecord["personA"]) =>
  [
    person.birthDate ? `b. ${person.birthDate}` : null,
    person.deathDate ? `d. ${person.deathDate}` : null,
    person.externalIdentityCount > 0 ? `${person.externalIdentityCount} external id(s)` : null
  ]
    .filter(Boolean)
    .join(" | ");

export const DuplicateReviewWorkspace = ({
  candidates,
  loading,
  onRefresh,
  onRecompute,
  onDismiss,
  onMerge,
  onOpenPerson
}: Props) => {
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);
  const [busyGlobal, setBusyGlobal] = useState(false);
  const [canonicalByCandidateId, setCanonicalByCandidateId] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.resolve(onRefresh()).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not load duplicate candidates");
    });
  }, [onRefresh]);

  const pendingCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.status === "PENDING"),
    [candidates]
  );

  const wrapGlobal = async (fn: () => Promise<void>) => {
    setBusyGlobal(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duplicate action failed");
    } finally {
      setBusyGlobal(false);
    }
  };

  const wrapCandidate = async (candidateId: string, fn: () => Promise<void>) => {
    setBusyCandidateId(candidateId);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duplicate action failed");
    } finally {
      setBusyCandidateId(null);
    }
  };

  const confirmMerge = async (candidate: PersonDuplicateCandidateRecord) => {
    const canonicalPersonId = canonicalByCandidateId[candidate.id] ?? candidate.personAId;
    const canonical = canonicalPersonId === candidate.personAId ? candidate.personA : candidate.personB;
    const duplicate = canonicalPersonId === candidate.personAId ? candidate.personB : candidate.personA;
    const message = `Merge ${duplicate.label} into ${canonical.label}? The duplicate profile will be removed after its links move.`;
    if (!window.confirm(message)) {
      return;
    }
    await onMerge(candidate.id, canonical.id, duplicate.id);
  };

  return (
    <section className="workspace-main-stack workspace-main-stack--secondary">
      <section className="card stack workspace-intro-card">
        <div className="stack">
          <h2>Duplicate review</h2>
          <p className="hint">Review possible duplicate people before any merge changes data.</p>
        </div>
        {error ? <p className="hint hint--danger">{error}</p> : null}
        <div className="workspace-action-row">
          <span className="status-pill">Pending: {pendingCandidates.length}</span>
          <button
            type="button"
            className="secondary-button workspace-action-button"
            disabled={busyGlobal}
            onClick={() => void wrapGlobal(onRecompute)}
          >
            Recompute candidates
          </button>
          <button
            type="button"
            className="secondary-button workspace-action-button"
            disabled={busyGlobal}
            onClick={() => void wrapGlobal(onRefresh)}
          >
            Refresh
          </button>
        </div>
      </section>

      <section className="card stack workspace-intro-card">
        <h3>Candidate queue</h3>
        {loading ? <p className="hint">Loading duplicate candidates...</p> : null}
        {!loading && pendingCandidates.length === 0 ? (
          <p className="hint">No pending duplicate candidates. Recompute to scan current people.</p>
        ) : null}
        <ul className="research-task-list">
          {pendingCandidates.map((candidate) => {
            const canonicalPersonId = canonicalByCandidateId[candidate.id] ?? candidate.personAId;
            const busy = busyCandidateId === candidate.id;
            return (
              <li key={candidate.id} className="research-task-item">
                <span className="status-pill">Score {candidate.score}</span>
                <div className="stack">
                  <strong>
                    {candidate.personA.label} / {candidate.personB.label}
                  </strong>
                  <span className="hint">
                    {formatPersonMeta(candidate.personA) || "No vitals for first person"}
                  </span>
                  <span className="hint">
                    {formatPersonMeta(candidate.personB) || "No vitals for second person"}
                  </span>
                  <span className="hint">
                    {candidate.reasons.map((reason) => reason.label).join(", ") || "No reason details"}
                  </span>
                </div>
                <label className="settings-toggle">
                  <select
                    value={canonicalPersonId}
                    disabled={busy}
                    aria-label={`Canonical person for ${candidate.personA.label} and ${candidate.personB.label}`}
                    onChange={(event) =>
                      setCanonicalByCandidateId((current) => ({
                        ...current,
                        [candidate.id]: event.target.value
                      }))
                    }
                  >
                    <option value={candidate.personAId}>Keep {candidate.personA.label}</option>
                    <option value={candidate.personBId}>Keep {candidate.personB.label}</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="text-link-button"
                  onClick={() => onOpenPerson(candidate.personAId)}
                >
                  Open first
                </button>
                <button
                  type="button"
                  className="text-link-button"
                  onClick={() => onOpenPerson(candidate.personBId)}
                >
                  Open second
                </button>
                <button
                  type="button"
                  className="text-link-button"
                  disabled={busy}
                  onClick={() => void wrapCandidate(candidate.id, () => onDismiss(candidate.id))}
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  className="secondary-button workspace-action-button"
                  disabled={busy}
                  onClick={() => void wrapCandidate(candidate.id, () => confirmMerge(candidate))}
                >
                  Merge
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
};
