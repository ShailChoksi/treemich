/**
 * @file Center Profile workspace: search, full person detail, tree navigation, create person.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { Person } from "../../lib/api";
import type { WorkspaceId } from "../../pages/people";
import { DestructiveConfirmDialog } from "../DestructiveConfirmDialog";
import { PersonDetailPanelWithProps } from "../PersonDetailPanel";
import { usePeopleGraphData } from "../../pages/PeopleGraphDataContext";
import { usePersonDetailPanelProps } from "../../pages/usePersonDetailPanelProps";
import { useToast } from "../../pages/ToastContext";
import { ProfilePersonSearch } from "./ProfilePersonSearch";

const PROFILE_SECTION_DEFAULTS = {
  names: false,
  lifeEvents: false,
  timeline: false,
  families: false,
  researchTasks: true
} as const;

export type ProfileWorkspaceProps = {
  /** Switches workspace (People page shell may intercept for unsaved Profile drafts). */
  requestWorkspaceChange: (workspace: WorkspaceId) => void;
  onOpenCreatePersonDialog: (defaults?: { defaultGivenName?: string; defaultSurname?: string }) => void;
};

const splitQueryForCreate = (raw: string) => {
  const trimmed = raw.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { defaultGivenName: parts[0]!, defaultSurname: parts.slice(1).join(" ") };
  }
  return { defaultGivenName: trimmed, defaultSurname: "" };
};

export const ProfileWorkspace = memo(
  ({ requestWorkspaceChange, onOpenCreatePersonDialog }: ProfileWorkspaceProps) => {
    const graph = usePeopleGraphData();
    const { setStatus } = useToast();
    const panelProps = usePersonDetailPanelProps();
    const [discardOpen, setDiscardOpen] = useState(false);
    const pendingRef = useRef<
      | { kind: "select"; person: Person }
      | { kind: "create"; defaults?: { defaultGivenName?: string; defaultSurname?: string } }
      | null
    >(null);

    const applyPersonSelection = useCallback(
      (person: Person) => {
        graph.mergePersonIntoPeople(person);
        graph.setSelectedPersonId(person.id);
        graph.setGraphCameraFocusPersonId(person.id);
        void graph.refreshGraphData({ bypassSaveGuard: true }).catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : "Could not refresh tree after profile change.");
        });
      },
      [graph, setStatus]
    );

    const requestSelectPerson = useCallback(
      (person: Person) => {
        if (graph.profileDraftDirty) {
          pendingRef.current = { kind: "select", person };
          setDiscardOpen(true);
          return;
        }
        applyPersonSelection(person);
      },
      [applyPersonSelection, graph.profileDraftDirty]
    );

    const requestCreatePerson = useCallback(
      (defaults?: { defaultGivenName?: string; defaultSurname?: string }) => {
        if (graph.profileDraftDirty) {
          pendingRef.current = { kind: "create", defaults };
          setDiscardOpen(true);
          return;
        }
        onOpenCreatePersonDialog(defaults);
      },
      [graph.profileDraftDirty, onOpenCreatePersonDialog]
    );

    const handleConfirmDiscard = useCallback(async () => {
      try {
        await graph.refreshPeopleOnly();
      } catch (error: unknown) {
        setStatus(error instanceof Error ? error.message : "Could not reset profile drafts.");
      }
      graph.setProfileDraftDirty(false);
      const pending = pendingRef.current;
      pendingRef.current = null;
      setDiscardOpen(false);
      if (!pending) {
        return;
      }
      if (pending.kind === "select") {
        applyPersonSelection(pending.person);
      } else {
        onOpenCreatePersonDialog(pending.defaults);
      }
    }, [applyPersonSelection, graph, onOpenCreatePersonDialog, setStatus]);

    const handleViewInTree = useCallback(() => {
      if (graph.selectedPersonId) {
        graph.setGraphCameraFocusPersonId(graph.selectedPersonId);
      }
      requestWorkspaceChange("tree");
    }, [graph, requestWorkspaceChange]);

    useEffect(() => {
      if (graph.isLoading || graph.selectedPersonId == null) {
        return;
      }
      if (graph.selectedPerson != null) {
        return;
      }
      if (graph.people.length === 0) {
        return;
      }
      graph.setSelectedPersonId(null);
    }, [
      graph.isLoading,
      graph.people.length,
      graph.selectedPerson,
      graph.selectedPersonId,
      graph.setSelectedPersonId
    ]);

    return (
      <section className="workspace-main-stack workspace-main-stack--profile" aria-label="Profile workspace">
        <header className="profile-workspace-header card stack">
          <div className="profile-workspace-header-row">
            <h2 className="profile-workspace-title">Profile</h2>
            <div className="profile-workspace-header-actions">
              <button type="button" className="secondary-button" onClick={() => requestCreatePerson()}>
                Create person
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={handleViewInTree}
                disabled={!graph.selectedPersonId}
              >
                View in tree
              </button>
            </div>
          </div>
          <ProfilePersonSearch
            selectedPersonId={graph.selectedPersonId}
            relationships={graph.relationships}
            onSelect={requestSelectPerson}
            onCreateFromQuery={(query) => requestCreatePerson(splitQueryForCreate(query))}
          />
        </header>

        {!graph.selectedPersonId ? (
          <section className="card stack profile-workspace-empty" aria-label="No person selected">
            <p className="hint">
              No person is selected. Use the search above to open a profile, or pick someone in the Tree
              workspace first.
            </p>
          </section>
        ) : !graph.selectedPerson ? (
          <section className="card stack profile-workspace-unavailable" role="alert">
            <h3>Person unavailable</h3>
            <p className="hint">
              The selected person is no longer in your tree data. Search again or return to the tree.
            </p>
          </section>
        ) : (
          <div className="profile-workspace-detail person-detail-panel person-detail-panel--profile-page">
            <PersonDetailPanelWithProps
              {...panelProps}
              sectionCollapsedOverrides={PROFILE_SECTION_DEFAULTS}
            />
          </div>
        )}

        <DestructiveConfirmDialog
          open={discardOpen}
          title="Discard unsaved changes?"
          description="You have unsaved profile edits. Discard them and continue?"
          confirmLabel="Discard"
          cancelLabel="Cancel"
          onCancel={() => {
            pendingRef.current = null;
            setDiscardOpen(false);
          }}
          onConfirm={() => void handleConfirmDiscard()}
        />
      </section>
    );
  }
);

ProfileWorkspace.displayName = "ProfileWorkspace";
