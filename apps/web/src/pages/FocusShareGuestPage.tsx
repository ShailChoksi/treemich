/**
 * @file Public Focus Share viewer — password gate, capped depths, read-only 3D graph.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { FocusShareGuestGraphResponse, FocusShareGuestView } from "@treemich/shared";
import { ApiHttpError, fetchGuestFocusShareGraph, unlockFocusShare } from "../lib/api";
import { GuestPeopleGraph3D } from "../components/share/GuestPeopleGraph3D";
import { GuestPersonDetailPanel } from "../components/share/GuestPersonDetailPanel";

type Props = {
  publicId: string;
};

type DepthState = {
  ancestorDepth: number;
  descendantDepth: number;
  collateralDepth: number;
};

const depthsStorageKey = (publicId: string) => `treemich.focusShare.guestDepths.${publicId}`;

const readStoredDepths = (publicId: string): DepthState | null => {
  try {
    const raw = sessionStorage.getItem(depthsStorageKey(publicId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<DepthState>;
    if (
      typeof parsed.ancestorDepth !== "number" ||
      typeof parsed.descendantDepth !== "number" ||
      typeof parsed.collateralDepth !== "number"
    ) {
      return null;
    }
    return {
      ancestorDepth: parsed.ancestorDepth,
      descendantDepth: parsed.descendantDepth,
      collateralDepth: parsed.collateralDepth
    };
  } catch {
    return null;
  }
};

const writeStoredDepths = (publicId: string, depths: DepthState) => {
  try {
    sessionStorage.setItem(depthsStorageKey(publicId), JSON.stringify(depths));
  } catch {
    /* sessionStorage may be unavailable */
  }
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const FocusShareGuestPage = ({ publicId }: Props) => {
  const [phase, setPhase] = useState<"booting" | "locked" | "ready">("booting");
  const [password, setPassword] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<FocusShareGuestView | null>(null);
  const [graph, setGraph] = useState<FocusShareGuestGraphResponse | null>(null);
  const [depths, setDepths] = useState<DepthState | null>(null);
  const [graphBusy, setGraphBusy] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const quietLabel = useMemo(() => {
    if (!share) {
      return "Shared Focus view";
    }
    return share.label?.trim() || "Shared Focus view";
  }, [share]);

  const focusAnchorLabel = useMemo(() => {
    if (!graph) {
      return "Focus person";
    }
    return (
      graph.people.find((person) => person.id === graph.share.focusAnchorPersonId)?.name ?? "Focus person"
    );
  }, [graph]);

  const loadGraph = useCallback(
    async (nextDepths?: DepthState | null) => {
      setGraphBusy(true);
      setError(null);
      try {
        const query = nextDepths
          ? {
              ancestorDepth: nextDepths.ancestorDepth,
              descendantDepth: nextDepths.descendantDepth,
              collateralDepth: nextDepths.collateralDepth
            }
          : {};
        const response = await fetchGuestFocusShareGraph(query);
        setShare(response.share);
        setGraph(response);
        const resolved: DepthState = {
          ancestorDepth: response.depths.ancestorDepth,
          descendantDepth: response.depths.descendantDepth,
          collateralDepth: response.depths.collateralDepth
        };
        setDepths(resolved);
        writeStoredDepths(publicId, resolved);
        setPhase("ready");
        return true;
      } catch (err: unknown) {
        if (err instanceof ApiHttpError && (err.statusCode === 401 || err.statusCode === 403)) {
          setPhase("locked");
          setGraph(null);
          setShare(null);
          return false;
        }
        setError(err instanceof Error ? err.message : "Failed to load shared graph");
        setPhase("locked");
        return false;
      } finally {
        setGraphBusy(false);
      }
    },
    [publicId]
  );

  useEffect(() => {
    const stored = readStoredDepths(publicId);
    void loadGraph(stored);
  }, [loadGraph, publicId]);

  const handleUnlock = async (event: FormEvent) => {
    event.preventDefault();
    setUnlockBusy(true);
    setError(null);
    try {
      const unlocked = await unlockFocusShare(publicId, { password });
      setShare(unlocked.share);
      setPassword("");
      // Fresh unlock resets to share maxes (ticket 01) — ignore any prior sessionStorage dial-downs.
      await loadGraph({
        ancestorDepth: unlocked.share.maxAncestorDepth,
        descendantDepth: unlocked.share.maxDescendantDepth,
        collateralDepth: unlocked.share.maxCollateralDepth
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not unlock this shared link");
      setPhase("locked");
    } finally {
      setUnlockBusy(false);
    }
  };

  const updateDepth = (key: keyof DepthState, value: number) => {
    if (!share || !depths) {
      return;
    }
    const maxes: DepthState = {
      ancestorDepth: share.maxAncestorDepth,
      descendantDepth: share.maxDescendantDepth,
      collateralDepth: share.maxCollateralDepth
    };
    const next: DepthState = {
      ...depths,
      [key]: clamp(value, 0, maxes[key])
    };
    setDepths(next);
    writeStoredDepths(publicId, next);
    setSelectedPersonId(null);
    void loadGraph(next);
  };

  const selectedPerson = useMemo(() => {
    if (!graph || !selectedPersonId) {
      return null;
    }
    return graph.people.find((person) => person.id === selectedPersonId) ?? null;
  }, [graph, selectedPersonId]);

  const handleSelectRelative = useCallback((personId: string) => {
    setSelectedPersonId(personId);
  }, []);

  if (phase === "booting") {
    return (
      <main className="guest-share-page">
        <section className="card guest-share-card stack" aria-label="Loading shared link">
          <div className="skeleton-card settings-skeleton" />
        </section>
      </main>
    );
  }

  if (phase === "locked") {
    return (
      <main className="guest-share-page">
        <section className="card guest-share-card stack">
          <h1>Shared Focus view</h1>
          <p className="hint">Enter the password to open this read-only family graph.</p>
          <form className="stack" onSubmit={(event) => void handleUnlock(event)}>
            <label>
              Password
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                required
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? <p className="error-text">{error}</p> : null}
            <button type="submit" className="confirm-dialog-submit" disabled={unlockBusy || !password}>
              {unlockBusy ? "Unlocking…" : "Unlock"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="guest-share-page guest-share-page--ready">
      <header className="guest-share-chrome">
        <div className="stack">
          <p className="guest-share-quiet-label">{quietLabel}</p>
          <p className="hint">Read-only shared Focus view</p>
        </div>
      </header>
      {error ? <p className="error-text guest-share-error">{error}</p> : null}
      {graphBusy && !graph ? (
        <div className="skeleton-card settings-skeleton" aria-label="Loading graph" />
      ) : null}
      {graph && share && depths ? (
        <div className="guest-share-layout">
          <GuestPeopleGraph3D
            people={graph.people}
            relationships={graph.relationships}
            layout={graph.layout}
            focusAnchorPersonId={graph.share.focusAnchorPersonId}
            focusAnchorLabel={focusAnchorLabel}
            selectedPersonId={selectedPersonId}
            onSelectedPersonChange={setSelectedPersonId}
            depths={depths}
            maxDepths={{
              ancestorDepth: share.maxAncestorDepth,
              descendantDepth: share.maxDescendantDepth,
              collateralDepth: share.maxCollateralDepth
            }}
            onDepthChange={updateDepth}
          />
          {selectedPerson ? (
            <GuestPersonDetailPanel
              key={selectedPerson.id}
              person={selectedPerson}
              people={graph.people}
              relationships={graph.relationships}
              onSelectRelative={handleSelectRelative}
              onClose={() => setSelectedPersonId(null)}
            />
          ) : null}
        </div>
      ) : null}
    </main>
  );
};
