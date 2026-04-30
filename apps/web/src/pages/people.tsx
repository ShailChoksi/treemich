import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MutableRefObject
} from "react";
import { defaultGraphRenderLimit, maxGraphRenderLimit, minGraphRenderLimit } from "@treemich/shared";
import type { UserPreferences } from "../lib/api";
import { getLocalStorageItem, setLocalStorageItem } from "../lib/safeLocalStorage";
import { parseMapUiSnapshot, type MapUiSnapshot } from "../lib/workspaceUiState";
import { CreatePersonDialog } from "../components/CreatePersonDialog";
import { MapPlacesPanel } from "../components/MapPlacesPanel";
import { PeopleGraph3D } from "../components/PeopleGraph3D";
import type {
  PeopleGraph3DHandlersBundle,
  PeopleGraph3DModelBundle,
  PeopleGraph3DPreferencesBundle,
  PeopleGraph3DStatusBundle,
  PeopleGraph3DViewStateBundle
} from "../components/peopleGraph3dSceneBundles";
import { PersonDetailPanel } from "../components/PersonDetailPanel";
import { WorkspaceSkeleton } from "../components/WorkspaceSkeleton";
import { PeopleGraphDataProvider, usePeopleGraphData } from "./PeopleGraphDataContext";
import { PeopleReviewProvider, usePeopleReview } from "./PeopleReviewContext";
import { usePersonDetail } from "./PersonDetailContext";
import { PersonDetailProviderTree } from "./PersonDetailProviderTree";
import { ToastProvider, useToast, type ToastMessage } from "./ToastContext";

export {
  deriveProfileDisplayValuesFromLifeEvents,
  parseDateInputToParts,
  buildBirthPlaceInput
} from "../lib/lifeEventUi";
export { findBestPersonMatchByName, resolvePeopleSelection } from "./people-selection";
export type { ResolvePeopleSelectionOptions } from "./people-selection";

const EvidenceLibrariesSection = lazy(() =>
  import("../components/EvidenceLibrariesSection").then((module) => ({
    default: module.EvidenceLibrariesSection
  }))
);
const EvidenceMediaSection = lazy(() =>
  import("../components/EvidenceMediaSection").then((module) => ({ default: module.EvidenceMediaSection }))
);
const GedcomInterchangeSection = lazy(() =>
  import("../components/GedcomInterchangeSection").then((module) => ({
    default: module.GedcomInterchangeSection
  }))
);
const ImmichImportWorkspace = lazy(() =>
  import("../components/ImmichImportWorkspace").then((module) => ({ default: module.ImmichImportWorkspace }))
);
const ResearchWorkspace = lazy(() =>
  import("../components/ResearchWorkspace").then((module) => ({ default: module.ResearchWorkspace }))
);
const DuplicateReviewWorkspace = lazy(() =>
  import("../components/DuplicateReviewWorkspace").then((module) => ({
    default: module.DuplicateReviewWorkspace
  }))
);
const ReportsWorkspace = lazy(() =>
  import("../components/reports/ReportsWorkspace").then((module) => ({ default: module.ReportsWorkspace }))
);

const WORKSPACE_STORAGE_KEY = "treemich.activeWorkspace";
const LEFT_PANE_OPEN_STORAGE_KEY = "treemich.leftPaneOpen";
const CONTEXT_OPEN_STORAGE_KEY = "treemich.contextOpen";
const MAP_UI_STATE_STORAGE_KEY = "treemich.map.uiState";

type WorkspaceId =
  | "tree"
  | "duplicates"
  | "research"
  | "evidence"
  | "interchange"
  | "places"
  | "reports"
  | "settings";

type WorkspaceItem = {
  id: WorkspaceId;
  label: string;
  iconLabel: string;
  disabledReason?: string;
};

const WORKSPACE_ITEMS: WorkspaceItem[] = [
  { id: "tree", label: "Tree", iconLabel: "TR" },
  { id: "duplicates", label: "Duplicates", iconLabel: "DQ" },
  { id: "research", label: "Research", iconLabel: "RS" },
  { id: "evidence", label: "Evidence", iconLabel: "EV" },
  { id: "interchange", label: "Interchange", iconLabel: "GX" },
  { id: "places", label: "Places", iconLabel: "MP" },
  { id: "reports", label: "Reports", iconLabel: "RP" },
  { id: "settings", label: "Settings", iconLabel: "ST" }
];

const noRelationshipsGraphFilterVisibility: NonNullable<UserPreferences["graphFilterVisibility"]> = {
  parentChild: false,
  spouse: false,
  sibling: false,
  friends: false,
  pets: false
};

const isWorkspaceEnabled = (workspaceId: WorkspaceId) =>
  WORKSPACE_ITEMS.find((item) => item.id === workspaceId)?.disabledReason == null;

const searchIncludeAlternateNamesEnabled = (preferences: UserPreferences | null | undefined) =>
  preferences?.searchIncludeAlternateNames ?? true;

const graphRenderLimitValue = (preferences: UserPreferences | null | undefined) =>
  preferences?.graphRenderLimit ?? defaultGraphRenderLimit;

const clampGraphRenderLimit = (value: number) =>
  Math.min(maxGraphRenderLimit, Math.max(minGraphRenderLimit, Math.round(value)));

type Props = {
  immichBaseUrl?: string | null;
  currentUserName?: string | null;
};

const ToastViewport = memo(({ toasts }: { toasts: ToastMessage[] }) => (
  <div className="toast-viewport" aria-live="polite" aria-label="Notifications">
    {toasts.map((toast) => (
      <div key={toast.id} className="toast-message">
        {toast.message}
      </div>
    ))}
  </div>
));

type WorkspaceNavProps = {
  activeWorkspace: WorkspaceId;
  leftPaneOpen: boolean;
  workspaceButtonRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  onWorkspaceChange: (workspace: WorkspaceId) => void;
  onWorkspaceKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
};

const WorkspaceNav = memo(
  ({
    activeWorkspace,
    leftPaneOpen,
    workspaceButtonRefs,
    onWorkspaceChange,
    onWorkspaceKeyDown
  }: WorkspaceNavProps) => (
    <aside
      className={`workspace-nav ${leftPaneOpen ? "workspace-nav--expanded" : "workspace-nav--collapsed"}`}
    >
      <nav aria-label="Workspace navigation" className="workspace-nav-list">
        {WORKSPACE_ITEMS.map((workspace, index) => {
          const isActive = workspace.id === activeWorkspace;
          const isDisabled = workspace.disabledReason != null;
          return (
            <button
              key={workspace.id}
              data-workspace={workspace.id}
              ref={(node) => {
                workspaceButtonRefs.current[index] = node;
              }}
              type="button"
              className={`workspace-nav-item ${isActive ? "workspace-nav-item--active" : ""} ${
                isDisabled ? "workspace-nav-item--disabled" : ""
              }`}
              aria-current={isActive ? "page" : undefined}
              disabled={isDisabled}
              title={workspace.disabledReason}
              onKeyDown={(event) => onWorkspaceKeyDown(event, index)}
              onClick={() => onWorkspaceChange(workspace.id)}
            >
              <span className="workspace-nav-icon" aria-hidden="true">
                {workspace.iconLabel}
              </span>
              <span className="workspace-nav-label">{workspace.label}</span>
              {isDisabled && leftPaneOpen ? (
                <span className="workspace-nav-status">{workspace.disabledReason}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </aside>
  )
);

const GraphContainer = memo(
  ({
    activeWorkspace,
    layoutResizeSignal,
    onNewPerson
  }: {
    activeWorkspace: WorkspaceId;
    layoutResizeSignal: number;
    onNewPerson: () => void;
  }) => {
    const graph = usePeopleGraphData();
    const { status } = useToast();
    const isTreeView = activeWorkspace === "tree";
    const noRelationshipsDefaultsEnabled =
      graph.relationships.length === 0 && !graph.savedPreferences?.graphFilterVisibility;

    const graphModel = useMemo<PeopleGraph3DModelBundle>(
      () => ({
        people: graph.people,
        relationships: graph.relationships,
        serverPositionsByPersonId: graph.serverLayout?.positionsByPersonId,
        serverLayoutRevision: graph.serverLayout?.layoutRevision ?? null,
        serverLayoutAlgorithmVersion: graph.serverLayout?.algorithmVersion ?? null,
        selectedPersonId: graph.selectedPersonId
      }),
      [
        graph.people,
        graph.relationships,
        graph.serverLayout?.positionsByPersonId,
        graph.serverLayout?.layoutRevision,
        graph.serverLayout?.algorithmVersion,
        graph.selectedPersonId
      ]
    );

    const graphStatus = useMemo<PeopleGraph3DStatusBundle>(
      () => ({
        status,
        isLoading: graph.isLoading,
        isSavingRelationship: graph.isSavingRelationship,
        loadError: graph.loadError,
        layoutError: graph.graphLayoutError ?? null,
        focusPersonRequest: graph.graphFocusPersonId,
        cameraFocusPersonRequest: graph.graphCameraFocusPersonId,
        treeValidationIssueCount: graph.treeValidationIssueCount,
        treeValidationEngineDisabled: graph.treeValidationEngineDisabled
      }),
      [
        status,
        graph.isLoading,
        graph.isSavingRelationship,
        graph.loadError,
        graph.graphLayoutError,
        graph.graphFocusPersonId,
        graph.graphCameraFocusPersonId,
        graph.treeValidationIssueCount,
        graph.treeValidationEngineDisabled
      ]
    );

    const graphPreferences = useMemo<PeopleGraph3DPreferencesBundle>(
      () => ({
        savedPreferences: graph.savedPreferences,
        defaultToNoRelationshipsGraphState: noRelationshipsDefaultsEnabled,
        noRelationshipsGraphFilterVisibility
      }),
      [graph.savedPreferences, noRelationshipsDefaultsEnabled]
    );

    const graphHandlers = useMemo<PeopleGraph3DHandlersBundle>(
      () => ({
        onFocusPersonConsumed: graph.clearGraphFocus,
        onCameraFocusPersonConsumed: graph.clearGraphCameraFocus,
        onSelectedPersonChange: graph.setSelectedPersonId,
        onCreateRelationship: graph.onCreateRelationship,
        onNewPerson,
        onPreferencesChange: graph.onPreferencesChange,
        onRetryGraphLoad: graph.retryGraphData,
        onRetryLayout: graph.retryGraphData
      }),
      [
        graph.clearGraphFocus,
        graph.clearGraphCameraFocus,
        graph.setSelectedPersonId,
        graph.onCreateRelationship,
        graph.onPreferencesChange,
        graph.retryGraphData,
        onNewPerson
      ]
    );

    const graphViewState = useMemo<PeopleGraph3DViewStateBundle>(
      () => ({
        graphKeyboardEnabled: true,
        layoutResizeSignal,
        initialUiState: graph.graphUiSnapshot,
        onUiStateChange: graph.setGraphUiSnapshot,
        isVisible: isTreeView
      }),
      [layoutResizeSignal, graph.graphUiSnapshot, graph.setGraphUiSnapshot, isTreeView]
    );

    return (
      <section
        className={`people-main-column ${isTreeView ? "" : "workspace-view-hidden"}`}
        aria-hidden={!isTreeView}
        inert={!isTreeView ? true : undefined}
      >
        <PeopleGraph3D
          graphModel={graphModel}
          graphStatus={graphStatus}
          graphPreferences={graphPreferences}
          graphHandlers={graphHandlers}
          graphViewState={graphViewState}
        />
      </section>
    );
  }
);

const DetailContainer = memo(
  ({ activeWorkspace, contextPaneOpen }: { activeWorkspace: WorkspaceId; contextPaneOpen: boolean }) => {
    return (
      <aside
        className={`people-sidebar workspace-context-pane ${contextPaneOpen ? "" : "workspace-pane--closed"}`}
      >
        <div
          className={activeWorkspace === "tree" ? "workspace-tree-context" : "workspace-view-hidden"}
          inert={activeWorkspace !== "tree" ? true : undefined}
          aria-hidden={activeWorkspace !== "tree"}
        >
          <PersonDetailPanel />
        </div>
        {activeWorkspace !== "tree" ? (
          <section
            className="card stack workspace-context-placeholder"
            hidden={!contextPaneOpen}
            aria-hidden={!contextPaneOpen}
          >
            <p className="hint">
              Optional context for {activeWorkspace} will appear here as this workspace gains secondary
              details, filters, and inspectors.
            </p>
          </section>
        ) : null}
      </aside>
    );
  }
);

export const PeoplePage = ({ immichBaseUrl = null, currentUserName = null }: Props) => (
  <ToastProvider>
    <PeopleGraphDataProvider immichBaseUrl={immichBaseUrl} currentUserName={currentUserName}>
      <PeopleReviewProvider>
        <PersonDetailProviderTree>
          <PeoplePageShell />
        </PersonDetailProviderTree>
      </PeopleReviewProvider>
    </PeopleGraphDataProvider>
  </ToastProvider>
);

const PeoplePageShell = () => {
  const graph = usePeopleGraphData();
  const detail = usePersonDetail();
  const review = usePeopleReview();
  const { toasts } = useToast();
  const [graphRenderLimitSaveState, setGraphRenderLimitSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const graphRenderLimitSaveRequestRef = useRef(0);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>(() => {
    if (typeof window === "undefined") {
      return "tree";
    }
    const stored = getLocalStorageItem(WORKSPACE_STORAGE_KEY);
    return WORKSPACE_ITEMS.some((item) => item.id === stored && isWorkspaceEnabled(item.id))
      ? (stored as WorkspaceId)
      : "tree";
  });
  const [leftPaneOpen, setLeftPaneOpen] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return getLocalStorageItem(LEFT_PANE_OPEN_STORAGE_KEY) !== "false";
  });
  const [contextPaneOpen, setContextPaneOpen] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return getLocalStorageItem(CONTEXT_OPEN_STORAGE_KEY) !== "false";
  });
  const [layoutResizeSignal, setLayoutResizeSignal] = useState(0);
  const [showCreatePersonDialog, setShowCreatePersonDialog] = useState(false);
  const [isCreatingPerson, setIsCreatingPerson] = useState(false);
  const [mapUiSnapshot, setMapUiSnapshot] = useState<MapUiSnapshot>(() =>
    parseMapUiSnapshot(getLocalStorageItem(MAP_UI_STATE_STORAGE_KEY))
  );
  const workspaceMainViewsRef = useRef<HTMLDivElement | null>(null);
  const workspaceButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const layoutResizeRafRef = useRef<number | null>(null);
  const lastPersistedMapUiSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    setLocalStorageItem(WORKSPACE_STORAGE_KEY, activeWorkspace);
  }, [activeWorkspace]);

  useEffect(() => {
    setLocalStorageItem(LEFT_PANE_OPEN_STORAGE_KEY, leftPaneOpen ? "true" : "false");
  }, [leftPaneOpen]);

  useEffect(() => {
    setLocalStorageItem(CONTEXT_OPEN_STORAGE_KEY, contextPaneOpen ? "true" : "false");
  }, [contextPaneOpen]);

  useEffect(() => {
    const serialized = JSON.stringify(mapUiSnapshot);
    if (lastPersistedMapUiSnapshotRef.current === serialized) {
      return;
    }
    const timeout = window.setTimeout(() => {
      lastPersistedMapUiSnapshotRef.current = serialized;
      setLocalStorageItem(MAP_UI_STATE_STORAGE_KEY, serialized);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [mapUiSnapshot]);

  useEffect(() => {
    const el = workspaceMainViewsRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (layoutResizeRafRef.current != null) {
        return;
      }
      layoutResizeRafRef.current = window.requestAnimationFrame(() => {
        layoutResizeRafRef.current = null;
        setLayoutResizeSignal((n) => n + 1);
      });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (layoutResizeRafRef.current != null) {
        window.cancelAnimationFrame(layoutResizeRafRef.current);
        layoutResizeRafRef.current = null;
      }
    };
  }, []);

  const handleWorkspaceNavKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const enabledIndexes = WORKSPACE_ITEMS.map((item, itemIndex) =>
      item.disabledReason == null ? itemIndex : null
    ).filter((itemIndex): itemIndex is number => itemIndex != null);
    const currentEnabledIndex = enabledIndexes.indexOf(index);
    const currentIndex = currentEnabledIndex >= 0 ? currentEnabledIndex : 0;
    const nextEnabledIndex =
      event.key === "ArrowDown"
        ? (currentIndex + 1) % enabledIndexes.length
        : (currentIndex - 1 + enabledIndexes.length) % enabledIndexes.length;
    const nextIndex = enabledIndexes[nextEnabledIndex] ?? 0;
    workspaceButtonRefs.current[nextIndex]?.focus();
  }, []);

  const openPersonFromResearch = useCallback(
    (personId: string) => {
      graph.setSelectedPersonId(personId);
      graph.setGraphCameraFocusPersonId(personId);
      setActiveWorkspace("tree");
    },
    [graph]
  );

  const getPersonLabelForMap = useCallback(
    (personId: string) => graph.people.find((person) => person.id === personId)?.name ?? personId,
    [graph.people]
  );

  const handleCreatePerson = useCallback(
    async (body: Parameters<typeof graph.handleCreatePerson>[0]) => {
      setIsCreatingPerson(true);
      try {
        await graph.handleCreatePerson(body);
        setShowCreatePersonDialog(false);
      } finally {
        setIsCreatingPerson(false);
      }
    },
    [graph]
  );

  const handleGraphRenderLimitChange = useCallback(
    (value: number) => {
      const next = clampGraphRenderLimit(value);
      const requestId = graphRenderLimitSaveRequestRef.current + 1;
      graphRenderLimitSaveRequestRef.current = requestId;
      setGraphRenderLimitSaveState("saving");
      void graph.onPreferencesChange({ graphRenderLimit: next }).then((saved) => {
        if (graphRenderLimitSaveRequestRef.current === requestId) {
          setGraphRenderLimitSaveState(saved ? "saved" : "error");
        }
      });
    },
    [graph]
  );

  const renderSecondaryWorkspace = () => {
    if (activeWorkspace === "evidence") {
      return (
        <section className="workspace-main-stack workspace-main-stack--evidence">
          <section className="card stack workspace-intro-card">
            <h2>Evidence workspace</h2>
            <p className="hint">
              Manage repositories, sources, and linked media outside of the person profile flow.
            </p>
          </section>
          {import.meta.env.VITE_EVIDENCE_MANAGEMENT_UI !== "false" ? (
            <>
              <EvidenceLibrariesSection />
              <EvidenceMediaSection />
            </>
          ) : (
            <section className="card stack workspace-intro-card">
              <p className="hint">Evidence workspace is disabled by feature flag.</p>
            </section>
          )}
        </section>
      );
    }

    if (activeWorkspace === "interchange") {
      return (
        <section className="workspace-main-stack workspace-main-stack--interchange">
          <section className="card stack workspace-intro-card">
            <h2>Interchange workspace</h2>
            <p className="hint">
              Use this space for GEDCOM import/export and optional Immich provider imports.
            </p>
          </section>
          <ImmichImportWorkspace
            people={graph.people}
            onImported={() => void graph.refreshGraphData({ bypassSaveGuard: true })}
          />
          <GedcomInterchangeSection
            people={graph.people}
            onTreeChanged={() => void graph.refreshGraphData()}
          />
        </section>
      );
    }

    if (activeWorkspace === "research") {
      return (
        <ResearchWorkspace
          people={graph.people}
          tasks={review.allResearchTasks}
          findings={review.validationFindings}
          tasksLoading={review.allResearchTasksLoading}
          findingsLoading={review.validationFindingsLoading}
          validationEngineDisabled={graph.treeValidationEngineDisabled}
          onRefreshTasks={review.refreshAllResearchTasks}
          onRefreshFindings={review.refreshValidationFindings}
          onRecomputeFindings={review.handleValidationRecompute}
          onTaskUpdate={review.handleResearchTaskUpdate}
          onTaskDelete={review.handleResearchTaskDelete}
          onFindingStatusChange={review.handleValidationFindingStatusChange}
          onOpenPerson={openPersonFromResearch}
        />
      );
    }

    if (activeWorkspace === "duplicates") {
      return (
        <DuplicateReviewWorkspace
          candidates={review.duplicateCandidates}
          loading={review.duplicateCandidatesLoading}
          onRefresh={review.refreshDuplicateCandidates}
          onRecompute={review.handleDuplicateRecompute}
          onDismiss={review.handleDuplicateDismiss}
          onMerge={review.handleDuplicateMerge}
          onOpenPerson={openPersonFromResearch}
        />
      );
    }

    if (activeWorkspace === "reports") {
      return <ReportsWorkspace people={graph.people} selectedPersonId={graph.selectedPerson?.id ?? null} />;
    }

    if (activeWorkspace === "settings") {
      return (
        <section className="workspace-main-stack workspace-main-stack--secondary">
          {graph.savedPreferences == null ? (
            <section className="card stack workspace-intro-card" aria-label="Loading search settings">
              <div className="skeleton-card settings-skeleton" />
            </section>
          ) : (
            <section className="card stack workspace-intro-card settings-card">
              <div className="stack">
                <h2>Graph settings</h2>
                <p className="hint">
                  Tune how much of the tree is rendered at once. Higher values show more people but can reduce
                  frame rate on large trees.
                </p>
              </div>
              <label className="settings-toggle">
                <input
                  type="number"
                  min={minGraphRenderLimit}
                  max={maxGraphRenderLimit}
                  step={20}
                  value={graphRenderLimitValue(graph.savedPreferences)}
                  onChange={(event) => {
                    const next = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(next)) {
                      handleGraphRenderLimitChange(next);
                    }
                  }}
                />
                <span>
                  <strong>Maximum rendered people</strong>
                  <span className="hint">
                    Current bounds are {minGraphRenderLimit} to {maxGraphRenderLimit}. Default is{" "}
                    {defaultGraphRenderLimit}.
                  </span>
                </span>
              </label>
              <p className="hint" role="status" aria-live="polite">
                Rendering up to {graphRenderLimitValue(graph.savedPreferences)} people.
                {graphRenderLimitSaveState === "saving" ? " Saving..." : null}
                {graphRenderLimitSaveState === "saved" ? " Graph render limit saved." : null}
                {graphRenderLimitSaveState === "error" ? " Could not save graph render limit." : null}
              </p>
              <div className="stack">
                <h2>Search settings</h2>
                <p className="hint">
                  Control how Treemich resolves people in natural-language relationship searches.
                </p>
              </div>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={searchIncludeAlternateNamesEnabled(graph.savedPreferences)}
                  disabled={graph.isSavingSearchPreferences}
                  onChange={(event) => graph.onSearchIncludeAlternateNamesChange(event.target.checked)}
                />
                <span>
                  <strong>Match alternate Treemich names in relationship search</strong>
                  <span className="hint">
                    Affects natural-language searches such as <code>mother of Beth</code>.
                  </span>
                </span>
              </label>
            </section>
          )}
        </section>
      );
    }

    return null;
  };

  const workspaceLayoutStyle = useMemo(
    () =>
      ({
        "--workspace-left-width": leftPaneOpen ? "206px" : "64px",
        "--workspace-right-width": contextPaneOpen ? "360px" : "0px"
      }) as CSSProperties,
    [contextPaneOpen, leftPaneOpen]
  );

  return (
    <section
      className="people-layout people-layout--workspace"
      style={workspaceLayoutStyle}
      aria-label="People workspace: navigation, main view, and context"
    >
      <ToastViewport toasts={toasts} />
      <WorkspaceNav
        activeWorkspace={activeWorkspace}
        leftPaneOpen={leftPaneOpen}
        workspaceButtonRefs={workspaceButtonRefs}
        onWorkspaceChange={setActiveWorkspace}
        onWorkspaceKeyDown={handleWorkspaceNavKeyDown}
      />

      <button
        type="button"
        className="secondary-button workspace-column-toggle workspace-column-toggle--left"
        onClick={() => setLeftPaneOpen((current) => !current)}
        aria-label={
          leftPaneOpen ? "Collapse workspace navigation column" : "Expand workspace navigation column"
        }
        title={leftPaneOpen ? "Collapse left column (workspace nav)" : "Expand left column (workspace nav)"}
      >
        <span className="workspace-column-toggle-hint" aria-hidden="true">
          Nav
        </span>
        <span className="workspace-column-grip" aria-hidden="true">
          ||
        </span>
      </button>

      <section className="workspace-main" id="main-content" tabIndex={-1}>
        <div className="workspace-main-views" ref={workspaceMainViewsRef}>
          <GraphContainer
            activeWorkspace={activeWorkspace}
            layoutResizeSignal={layoutResizeSignal}
            onNewPerson={() => setShowCreatePersonDialog(true)}
          />
          <section
            className={`workspace-main-stack workspace-main-stack--places ${
              activeWorkspace === "places" ? "" : "workspace-view-hidden"
            }`}
            aria-hidden={activeWorkspace !== "places"}
          >
            <section className="card stack workspace-intro-card">
              <h2>Places workspace</h2>
              <p className="hint">Review mapped places and focus people from geographic context.</p>
            </section>
            {activeWorkspace === "places" ? (
              <MapPlacesPanel
                isActive={activeWorkspace === "places"}
                onFocusPerson={graph.focusPersonInGraph}
                getPersonLabel={getPersonLabelForMap}
                selectedPersonId={graph.selectedPersonId}
                layoutResizeSignal={layoutResizeSignal}
                refreshSignal={graph.people}
                initialUiState={mapUiSnapshot}
                onUiStateChange={setMapUiSnapshot}
              />
            ) : null}
          </section>
          {activeWorkspace !== "tree" && activeWorkspace !== "places" ? (
            <Suspense fallback={<WorkspaceSkeleton />}>{renderSecondaryWorkspace()}</Suspense>
          ) : null}
        </div>
      </section>
      <button
        type="button"
        className="secondary-button workspace-column-toggle workspace-column-toggle--right"
        onClick={() => setContextPaneOpen((current) => !current)}
        aria-label={contextPaneOpen ? "Collapse person context column" : "Expand person context column"}
        title={
          contextPaneOpen ? "Collapse right column (person context)" : "Expand right column (person context)"
        }
      >
        <span className="workspace-column-toggle-hint" aria-hidden="true">
          Profile
        </span>
        <span className="workspace-column-grip" aria-hidden="true">
          ||
        </span>
      </button>

      <DetailContainer activeWorkspace={activeWorkspace} contextPaneOpen={contextPaneOpen} />
      <CreatePersonDialog
        open={showCreatePersonDialog}
        busy={isCreatingPerson}
        onConfirm={handleCreatePerson}
        onCancel={() => setShowCreatePersonDialog(false)}
      />
    </section>
  );
};
