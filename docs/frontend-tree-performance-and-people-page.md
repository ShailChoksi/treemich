# Frontend tree performance and `PeoplePage` architecture

This document captures an explicit audit of the Treemich web app’s **3D relationship tree** (family graph), **data flow from API to GL**, and **performance / refactor candidates**. It is meant as a durable reference for future work.

**Related:** [Data Flow-API-Tree View Rendering.txt](./Data%20Flow-API-Tree%20View%20Rendering.txt) — step-by-step pipeline (kept as a short companion); this file is the full narrative.

**Domain context:** See [CONTEXT.md](../CONTEXT.md) (person identity, `personId`, ProfileResolver). Tree rendering is not identity logic; it consumes canonical people and relationships from the API.

**ADR:** [docs/adr/0001-person-as-source-of-truth.md](./adr/0001-person-as-source-of-truth.md) — does not constrain frontend splitting.

---

## 1. Stack and rendering model

| Layer             | Technology                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| UI framework      | React 19, Vite, TypeScript                                                                            |
| Tree / graph view | Three.js via `@react-three/fiber`, `@react-three/drei`                                                |
| Output            | WebGL2 (custom renderer: `powerPreference: "high-performance"`, `antialias: false`, `stencil: false`) |
| Frame loop        | `frameloop="demand"` on R3F `Canvas` — GL frames when invalidated, not a continuous game loop         |

The tree is **not** DOM/SVG virtualization; it is a **3D scene** of meshes, lines, and billboarded text.

---

## 2. File map (graph / tree)

### Entry and scene

| Path                                                        | Role                                                                                                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/PeopleGraph3D.tsx`                 | Memoized shell: layout hook, camera, keyboard, overlays; receives **bundled scene props** (see `peopleGraph3dSceneBundles.ts`) and passes into `GraphCanvasScene` |
| `apps/web/src/components/peopleGraph3dSceneBundles.ts`      | Types for `graphModel` / `graphStatus` / `graphPreferences` / `graphHandlers` / `graphViewState` bundles (stable memo surfaces for `PeopleGraph3D`)               |
| `apps/web/src/components/graph/GraphCanvasScene.tsx`        | R3F `<Canvas>`, lights, `OrbitControls`, batched relationship lines, `AnimatedNodes`, thumbnail pipeline hooks                                                    |
| `apps/web/src/components/graph/GraphSceneContext.tsx`       | Inner scene context for thumbnail/render LOD data (`peopleIds`, thumbnail cache keys, priority ids, near ids, camera LOD buckets)                                 |
| `apps/web/src/components/graph/scene/AnimatedNodes.tsx`     | Maps visible people to tiered node groups (detailed / thumbnail / minimal), renders instanced disk/ring geometry plus per-person overlays                         |
| `apps/web/src/components/graph/scene/NodeInstancedMesh.tsx` | Instanced disk/ring geometry per LOD tier; display-only, no raycasting; uses animated node positions to stay aligned with hit meshes                              |
| `apps/web/src/components/graph/PersonNode.tsx`              | Per-person Three content that remains non-instanced: hit mesh, labels, halo, thumbnail texture quad; `memo` on variants                                           |

### Layout and visibility

| Path                                                                    | Role                                                                                                                              |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/graph/useGraphLayoutState.ts`                  | Thin composition hook: relationship filtering, layout orchestration, visibility, and stable return surface                        |
| `apps/web/src/components/graph/useLayoutOrchestrator.ts`                | Server vs worker vs sync layout, topology revision, topology cache, stale worker/server fallback                                  |
| `apps/web/src/components/graph/useGraphVisibility.ts`                   | **Orchestrates** progressive cap, visible-people pipeline, camera LOD slice, and batched visible lines (delegates to hooks below) |
| `apps/web/src/components/graph/useGraphProgressiveRenderLimit.ts`       | Progressive **render limit** state + **150ms** batching until full candidate count                                                |
| `apps/web/src/components/graph/useGraphVisiblePeoplePipeline.ts`        | Focus offset, pinned-person slot, `pickNearest` subset, `displayVisiblePeople`, bounds                                            |
| `apps/web/src/components/graph/useGraphCameraLodSlice.ts`               | `computeCameraVisibility` + render-visible people / buckets / near ids                                                            |
| `apps/web/src/components/graph/useGraphVisibleRelationshipLinesStep.ts` | `buildMergedParentGroups` + `buildVisibleRelationshipLines` (+ optional layout profiler)                                          |
| `apps/web/src/components/graph/layout.ts`                               | Re-exports `positionPeople` and types                                                                                             |
| `apps/web/src/components/graph/layout.worker.ts`                        | Worker entry: runs `positionPeople`, posts positions                                                                              |
| `apps/web/src/components/graph/layoutWorkerClient.ts`                   | Main-thread RPC, timeouts (~12s), pending map by request id                                                                       |
| `apps/web/src/components/graph/useGraphLayoutWorker.ts`                 | Hook around worker client with sync fallback                                                                                      |
| `apps/web/src/components/graph/graphLayoutConstants.ts`                 | e.g. worker threshold **320** people                                                                                              |
| `apps/web/src/components/graph/topologyLayoutCache.ts`                  | Insertion-ordered cache, cap **8** topology entries                                                                               |
| `apps/web/src/components/graph/graphVisibility.ts`                      | Camera LOD: **near / mid / far / culled** + hysteresis; minimum visible when culled                                               |
| `apps/web/src/components/graph/graphRelationshipLines.ts`               | Edge segments from relationships + merged parent groups; `partitionLinesByStyle` for 2-point `LineSegments` batching              |
| `apps/web/src/components/graph/layout/*`                                | Buchheim-style family tree, photo layout, overlap, naming, etc.                                                                   |

### Motion, camera sampling, GL setup

| Path                                                                                                            | Role                                                                                              |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/graph/scene/useAnimatedNodeTransforms.ts`                                              | `useFrame` lerp of node groups to targets; exposes animated positions for instanced visual meshes |
| `apps/web/src/components/graph/scene/useOrbitPositionSync.ts`                                                   | Samples camera for culling: **throttled ~90ms**, min distance **0.2**                             |
| `apps/web/src/components/graph/scene/createWebGlRenderer.ts`                                                    | WebGL2 renderer factory                                                                           |
| `apps/web/src/components/graph/useGraphCamera.ts`, `useGraphCameraControls.ts`, `useGraphKeyboardNavigation.ts` | Framing, focus, arrow navigation                                                                  |

### Thumbnails

| Path                                                      | Role                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/web/src/components/graph/useThumbnailLoader.ts`     | Batches loads, camera ordering, backoff; coordinates with worker                 |
| `apps/web/src/components/graph/thumbnailCache.ts`         | Module-level `Map` caches (textures / bitmaps), cap **1000**, eviction           |
| `apps/web/src/components/graph/thumbnailLoader.worker.ts` | `fetch` + `createImageBitmap` off main thread                                    |
| `apps/web/src/components/graph/thumbnailWorkerClient.ts`  | RPC to thumbnail worker                                                          |
| `apps/web/src/components/graph/thumbnailPerfProfiler.ts`  | Dev-only thumbnail/LOD instrumentation behind `treemich:profile-thumbnail-graph` |

### Page integration

| Path                                              | Role                                                                                                                                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/pages/people.tsx`                   | `PeoplePage` shell and workspace layout; graph/detail via providers; **`GraphContainer`** memoises **bundles** for `PeopleGraph3D`; **`DetailContainer`** renders **`PersonDetailPanel`** (no prop blob) |
| `apps/web/src/pages/PeopleGraphDataContext.tsx`   | Graph data provider: people, relationships, server layout, selection, preferences, refresh tiers, **`retryGraphData`** (stable void wrapper for retries), mutations                                      |
| `apps/web/src/pages/PersonDetailProviderTree.tsx` | Mount point for person-detail providers (today: single `PersonDetailProvider`; add sibling contexts here when splitting)                                                                                 |
| `apps/web/src/pages/PersonDetailContext.tsx`      | Person detail provider: detail/life-event/research/family/duplicate flows; calls graph refresh tiers when detail changes affect graph data                                                               |
| `apps/web/src/pages/usePersonDetailPanelProps.ts` | **`usePersonDetailPanelProps`:** builds the full `PersonDetailPanel` prop object from graph + detail (single memo used by **`PersonDetailPanel`**)                                                       |
| `apps/web/src/components/PersonDetailPanel.tsx`   | **`PersonDetailPanel`** (default): context-connected; **`PersonDetailPanelWithProps`:** explicit props for tests/stories                                                                                 |
| `apps/web/src/lib/api.ts`                         | `getPeople`, `getRelationships`, `computeGraphLayout` (`POST /graph/layout`), etc.                                                                                                                       |

---

## 3. Data flow: API → tree (explicit)

1. **`App.tsx`** loads user, lazy-loads **`PeoplePage`**.
2. **`PeoplePage`** mounts providers: `ToastProvider` → `PeopleGraphDataProvider` → **`PersonDetailProviderTree`** → page shell.
3. **`PeopleGraphDataProvider`** on mount calls **`refreshGraphData()`**.
4. **`refreshGraphData`** (in `PeopleGraphDataContext.tsx`):
   - `Promise.all([ getPeople(), getRelationships(), getUserPreferences().catch(...) ])`
   - Sorts people and relationships stably (`sortPeopleStable`, `sortRelationshipsStable`).
   - Updates `people` / `relationships` / preferences inside `startTransition` (with **`samePeopleList` / `sameRelationshipList`** to avoid new array references when semantically unchanged).
   - **`resolvePeopleSelection`** → `setSelectedPersonId`, `setGraphCameraFocusPersonId`.
   - Increments **`layoutRequestIdRef`**, clears `serverLayout`, then **`computeGraphLayout({...})`** (async `.then` / `.catch`) → **`setServerLayout`** or error + local layout fallback message.
   - Sends `familyViewStyle: "generationTree"` explicitly. Do this even when `/user/preferences` omits `familyViewStyle`; the client layout orchestrator validates server layout revisions against generation-tree topology, so an undefined style can make the server layout unusable and leave the tree relying on fallback layout.
5. **Refresh tiers:** mutation callers now choose the cheapest safe path:
   - **Tier A `refreshPeopleOnly`:** `getPeople()` only; used for name/profile/thumbnail/Immich identity flows that do not change graph topology.
   - **Tier B `refreshRelationshipsOnly`:** `getRelationships()` only; scoped to metadata-only relationship updates such as spouse date/life-event metadata where person ids and relationship type are unchanged.
   - **Tier C `refreshGraphData`:** full people + relationships + preferences + server layout; used for create/delete person, create/delete/structurally change relationship, duplicate merge, imports, mount, retries.
6. **`GraphContainer`** (memo, in `people.tsx`) wraps **`PeopleGraph3D`** when workspace is tree; passes **five memoised bundles** (model, status, preferences, handlers, view state). Handlers use **`graph.retryGraphData`** for retry buttons (no per-render inline `() => void refreshGraphData()`).
7. **`PeopleGraph3D`** filters people/relationships if needed, calls **`useGraphLayoutState`** with server positions + revision + camera position + render limit (**starts at 120**, grows by **120** every **150ms** until full — progressive reveal).
8. **`useGraphLayoutState`** now composes:
   - **`useLayoutOrchestrator`:** if server layout is complete and revision matches → server positions; else topology cache (8 entries); else **worker** if people count **≥ 320**; else sync `positionPeople` on main thread.
   - **`useGraphVisibility`:** composes **`useGraphProgressiveRenderLimit`**, **`useGraphVisiblePeoplePipeline`**, **`useGraphCameraLodSlice`**, **`useGraphVisibleRelationshipLinesStep`** (same snapshot for nodes and lines).
9. **`GraphCanvasScene`** mounts Canvas, restores graph UI snapshot from props/state, renders 2-point relationship edges as batched `THREE.LineSegments` grouped by style and keeps longer trunk polylines as Drei `<Line>`.
10. **`AnimatedNodes`** renders display-only `InstancedMesh` disk/ring geometry per LOD tier, plus per-person meshes for hit areas, labels, halos, and unique thumbnail texture quads.
11. **Thumbnails:** worker → bitmap → texture → module cache → `PersonNode` reads cache / fade-in material.

---

## 4. Optimizations already present

- **React:** provider split for graph/detail state; `memo` on `PeopleGraph3D`, `GraphContainer`, `DetailContainer`, `WorkspaceNav`, `ToastViewport`, `PersonDetailPanel`, graph leaf nodes.
- **Graph prop bundles:** `PeopleGraph3D` receives five stable **`useMemo`** surfaces from `GraphContainer`; **`retryGraphData`** on graph context avoids unstable inline retry callbacks.
- **Detail panel wiring:** `PersonDetailPanel` pulls graph + detail through **`usePersonDetailPanelProps`** (tests use **`PersonDetailPanelWithProps`**).
- **Stable list equality:** `samePeopleList`, `sameRelationshipList` reduce prop churn into the graph.
- **Refresh tiers:** `refreshPeopleOnly`, `refreshRelationshipsOnly`, and full `refreshGraphData` avoid unnecessary full reload + layout work for metadata-only edits.
- **Tier B UX:** after relationship-scoped life-event mutations, **`refreshRelationshipsOnly`** runs in the **background** (`void …catch`) once local relationship-event caches are updated, so the UI does not block on the refetch.
- **Transitions:** large people/relationship/preference state setters in full refresh are wrapped in `startTransition`; loading/layout state remains urgent.
- **Layout:** server layout when available; topology cache; **Web Worker** for large graphs; **request id** discard for stale layout responses.
- **Layout architecture:** `useLayoutOrchestrator` owns server/worker/sync positioning; visibility is split across **`useGraphVisibility`** + focused hooks (progressive cap, visible-people pipeline, camera LOD, visible lines).
- **Visibility:** 4-bucket camera LOD + hysteresis; progressive **render limit**; **`pickNearest`** when over limit.
- **GPU:** `frameloop="demand"`; `dpr` cap; large-graph **frame skipping** for non-priority node lerps; instanced disk/ring geometry per LOD tier.
- **Lines:** 2-point relationship edges are batched into `THREE.LineSegments` by style; longer trunk polylines stay as Drei `<Line>`.
- **Thumbnails:** worker decode; **module cache** with cap; exponential backoff on failures; camera-proximity ordering.
- **Resize:** `ResizeObserver` on `.workspace-main-views` → **RAF**-guarded bump of **`layoutResizeSignal`** for canvas refresh.
- **Persistence:** debounced (~**350ms**) localStorage for graph/map UI snapshots (see code in `people.tsx`).
- **Async safety:** many **`useRef`** mirrors for guards (`profileDraftDirtyRef`, save flags, `selectedPersonIdRef`, layout request id, map request id); **AbortController** patterns in lazy loads for person-scoped data (effects in `people.tsx`).

---

## 5. Current gaps and risks (explicit)

| Area                         | Current state                                                                                                                                                                                                                                                                                    | Remaining risk / follow-up                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Instanced node geometry**  | Implemented for disk/ring backgrounds via `NodeInstancedMesh`, one pair per LOD tier. Picking remains on per-person invisible hit meshes; thumbnails, labels, and halos stay per-person. T1 thumbnail instrumentation now logs loader/render pressure behind `treemich:profile-thumbnail-graph`. | Unique thumbnail texture quads are still one mesh per visible thumbnail. Full texture-atlas instancing remains gated on a representative T1 profile; then consider paged atlas (**T2**) only if thumbnails are the bottleneck. |
| **Relationship lines**       | 2-point edges are batched with `THREE.LineSegments`; 3+ point trunks remain Drei `<Line>`. Dash constants live in `graphLineMaterials.ts`. Unit tests cover `relationshipLineStyleKey`, `partitionLinesByStyle` (trunk vs 2-point, dashed vs solid buckets), and exported dash constants.        | Dashed batched segments use `LineDashedMaterial` rather than Drei's line shader; keep P3 unit coverage aligned with dash tuning.                                                                                               |
| **Granular refresh**         | People-only and relationships-only tiers exist; profile save already merges **`setPeople`** optimistically after `updatePersonProfile`. Relationship life-event create/update/delete paths update local event caches immediately and reconcile via async Tier B `refreshRelationshipsOnly`.      | Structural changes still require Tier **C**. Further optimistic **`relationships`** array patching (beyond async Tier **B** refetch) remains deferred unless UI metadata requires it.                                          |
| **Server layout defaults**   | `PeopleGraphDataProvider` sends `familyViewStyle: "generationTree"` to `POST /graph/layout` regardless of whether older preferences include that key.                                                                                                                                            | Keep `apps/web/src/pages/people-page.integration.spec.tsx` coverage aligned if the default family tree style changes; otherwise newly created or older accounts can lose usable server positions.                              |
| **Layout hook surface**      | `useGraphVisibility` is a thin orchestrator; progressive / people / camera / lines live in dedicated modules.                                                                                                                                                                                    | Watch hook option lists as new camera or line features land; keep **one snapshot** across composed hooks.                                                                                                                      |
| **People page architecture** | `PeopleReviewProvider` now owns research tasks, validation findings, and duplicate candidates between `PeopleGraphDataProvider` and `PersonDetailProviderTree`. `PersonDetailPanel` production research UI reads `usePeopleReview()` directly.                                                   | `PersonDetailContext` still owns profile drafts, life events, families, and relationship/family edits; split those only with focused provider tests.                                                                           |
| **Deferred rendering**       | `startTransition` is used for large full-refresh setters. `useDeferredValue` was tried for visible nodes but removed because it let nodes and lines briefly render from different snapshots.                                                                                                     | Any future deferred graph rendering must keep nodes, hit meshes, and lines on the same positional snapshot.                                                                                                                    |

---

## 6. Refresh tiers and call-site contract

Graph refresh now has three explicit tiers:

| Tier | Function                   | API work                                                                    | Intended callers                                                                                                                                    |
| ---- | -------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | `refreshPeopleOnly`        | `getPeople()`                                                               | Name/profile edits, thumbnail import/upload, Immich link/unlink, other person-only metadata changes                                                 |
| B    | `refreshRelationshipsOnly` | `getRelationships()`                                                        | Relationship metadata/life-event changes where `fromPersonId`, `toPersonId`, and `type` do not change                                               |
| C    | `refreshGraphData`         | `getPeople()` + `getRelationships()` + preferences + `computeGraphLayout()` | Mount, retry, create/delete person, create/delete/structurally change relationship, family structure changes, duplicate merge, GEDCOM/Immich import |

The important invariant: **anything that changes topology must use Tier C** because server/client layout revisions include topology-filtered relationships and node positions can change. Tier B is safe only for relationship metadata that does not affect topology.

For Tier C, keep these request-shape invariants:

- `computeGraphLayout` receives people as `{ id, name }`, where names come from `getPersonNameForGraphLayout`.
- Relationships must pass through `filterGraphLayoutTopologyRelationships` before layout, so metadata-only edges do not influence topology revisions.
- `familyViewStyle` is the client default `"generationTree"` unless a deliberate future migration changes both client layout validation and server layout behavior. Do not pass through `undefined` from older preferences.

---

## 7. Tests touching this area

| File                                                                    | What it covers                                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/web/src/pages/people.spec.ts`                                     | Re-exports from `lifeEventUi` and selection helpers                                                     |
| `apps/web/src/pages/people-selection.spec.ts`                           | `findBestPersonMatchByName`, `resolvePeopleSelection`                                                   |
| `apps/web/src/pages/people-page.integration.spec.tsx`                   | Integration around `PeoplePage` / workspaces (bundled `PeopleGraph3D` mock)                             |
| `apps/web/src/pages/PeopleGraphDataContext.spec.tsx`                    | Graph data provider load path, refresh tiers, **`retryGraphData`**                                      |
| `apps/web/src/pages/PeopleReviewContext.spec.tsx`                       | Page-scoped review provider lazy loads, workspace refresh handlers, duplicate merge full refresh        |
| `apps/web/src/pages/PersonDetailContext.spec.tsx`                       | Detail provider draft/life-event behavior and Tier-B relationship life-event reconciliation             |
| `apps/web/src/components/PeopleGraph3D.spec.tsx`                        | Graph component behavior                                                                                |
| `apps/web/src/components/graph/hooks.layoutState.spec.tsx`              | Layout state, worker fallback/staleness, server layout preference, progressive reveal, culling          |
| `apps/web/src/components/graph/useGraphProgressiveRenderLimit.spec.tsx` | Progressive cap timing and topology reset                                                               |
| `apps/web/src/components/graph/graphRelationshipLines.spec.ts`          | Relationship line construction, `partitionLinesByStyle`, **`relationshipLineStyleKey`** dashed vs solid |
| `apps/web/src/components/graph/scene/NodeInstancedMesh.spec.ts`         | Instanced node layer ordering for disk/ring vs thumbnails                                               |
| `apps/web/src/components/PersonDetailPanel.spec.ts`                     | **`PersonDetailPanelWithProps`** behaviour                                                              |

Refactors of **`PeoplePage`** should keep **`people.spec.ts`** imports working (move pure helpers to `people-selection.ts` or similar if the page file shrinks).

---

## 8. Deepening opportunities (numbered backlog)

1. **Continue splitting `PersonDetailContext`:** `PeopleReviewProvider` is done; remaining candidates are life events, families, relationship/family edits, and profile drafts.
2. **Broaden granular data updates:** optional optimistic **`relationships`** patching for Tier-B-safe edits; keep topology-changing operations on Tier **C**.
3. ~~**Further split `useGraphVisibility`:**~~ **Done (initial slice):** progressive cap, visible-people pipeline, camera LOD, and visible lines are separate hooks; **`useGraphVisibility`** orchestrates them.
4. **Thumbnail texture atlas / instanced thumbnails:** defer until a documented **T1** profile shows thumbnail mesh/texture pressure; then design paged atlas (**T2**).
5. **Line visual parity:** P3 utility/material constant tests are in place; keep them aligned when designers tune dashed edges.

### 8.1 Deferred / not in this pass

- **Remaining detail split:** `PeopleReviewProvider` is split out, but `PersonDetailContext` still owns several domains. Split the next provider by ownership and subscription churn, not by line count alone.
- **Deeper G2 detail sections:** production research UI now uses `usePeopleReview()` directly, but other detail sections still flow through `usePersonDetailPanelProps`.
- **Atlas / pixel line CI:** thumbnail atlas work remains gated on T1 measurement, and line parity remains P3 unit-level coverage rather than automated canvas screenshot testing.

### 8.2 Thumbnail profiling gate

Enable T1 instrumentation in development by setting:

```text
localStorage.setItem("treemich:profile-thumbnail-graph", "true")
```

The console logs include thumbnail request count, loaded texture/progress count, texture/bitmap cache sizes, visible people count, near-camera counts, rendered thumbnail-tier nodes, and camera LOD bucket counts. Capture a representative profile before starting any atlas work:

- graph size and visible thumbnail-tier count,
- browser, hardware/GPU, and approximate viewport,
- frame time or clear interaction degradation,
- profiler logs showing thumbnail mesh/texture pressure is the dominant bottleneck.

Do **not** start T2 atlas implementation if the profile points instead at layout, labels, relationship lines, camera culling, or unrelated React work.

### 8.3 Architecture decisions from the April 30 review

The implementation followed this order from the review conversation:

| Area                        | Decision                                                                                                                          | Current state                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PersonDetailContext` split | Optimize first for **fewer subscriptions** and **ownership**; prefer **S1 sibling providers** under a thin wrapper.               | `PeopleReviewProvider` now owns research, validation, and duplicate state; remaining detail domains are deferred.                                                                                   |
| Detail panel wiring         | Use **G1 + G2**: panel/sections should pull through hooks where useful, and the page shell should stop owning the full prop blob. | `DetailContainer` renders `PersonDetailPanel`; production research section reads `usePeopleReview()` directly. Other sections still use `usePersonDetailPanelProps`.                                |
| `useGraphVisibility` split  | Extract in order **V1 visible lines → V3 progressive reveal → V2 camera LOD** while preserving one positional snapshot.           | Done as focused hooks composed by `useGraphVisibility`.                                                                                                                                             |
| Granular refresh            | Use **O1 then O2**; avoid speculative topology or guessed layout (**no O3**) until Tier C completes.                              | Profile save already patches local `people`; relationship life-event updates update local event caches and trigger async Tier B refetch. Full optimistic `relationships` patching remains deferred. |
| Thumbnail atlas             | Stay at **T3 until T1 is measured**, then consider paged atlases (**T2**).                                                        | T1 dev instrumentation and threshold guidance are documented; atlas remains conditional.                                                                                                            |
| Line parity                 | Use **P3**: unit-level coverage for line style keys, partitioning, and constants; no pixel CI for now.                            | Unit coverage added/expanded; no screenshot tests.                                                                                                                                                  |
| `PeopleGraph3D` props       | Use **H1 then H2**: stable bundles first, scene context only if profiling still shows churn.                                      | H1 bundle props and the first H2 `GraphSceneContext` slice are done; handlers and camera refs remain props.                                                                                         |

Why the remaining items were deferred:

- **Remaining detail splits** should follow the `PeopleReviewProvider` pattern: page-scoped when the state belongs to workspaces/sidebar sections, and detail-scoped when it belongs to the selected person edit flow.
- **Further H2** should move handlers/camera refs only if a clean scene boundary appears; the first context slice intentionally moved thumbnail/render LOD data only.
- **Full O1/O2 optimistic merging** needs explicit invariants so Tier-B-safe metadata patches never masquerade as topology changes. The current async Tier B refetch is a safer latency improvement.
- **G2 section memoization** is useful only after deciding the `PersonDetailPanel` section seams; otherwise it risks moving the same wide interface into many shallow modules.

---

## 9. `PeoplePage` split status

The original monolithic `people.tsx` gap has been partially resolved. Current rough file sizes:

| File                                            | Current role                                                                                            | Approx. size |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------ |
| `apps/web/src/pages/people.tsx`                 | Page shell, workspace layout, `GraphContainer` bundle memos, `DetailContainer`, review workspace wiring | ~705 lines   |
| `apps/web/src/pages/PeopleGraphDataContext.tsx` | Graph data, selection, server layout, refresh tiers, graph mutations                                    | ~765 lines   |
| `apps/web/src/pages/PeopleReviewContext.tsx`    | Page-scoped research, validation, duplicate review state/handlers                                       | ~275 lines   |
| `apps/web/src/pages/PersonDetailContext.tsx`    | Detail panel state, person-scoped lazy loads, profile/life-event/family/relationship edits              | ~1110 lines  |

### 9.1 Current shell state (`people.tsx`)

Workspace chrome: `activeWorkspace`, `leftPaneOpen`, `contextPaneOpen`, `layoutResizeSignal`, create-person dialog state, and map UI snapshot. Graph core state lives in `PeopleGraphDataContext`; review/workspace state lives in `PeopleReviewProvider`; selected-person detail edit state lives in `PersonDetailContext`. **`PersonDetailPanel`** reads graph/detail props via **`usePersonDetailPanelProps`**, while the production research section reads **`usePeopleReview()`** directly.

### 9.2 Child components defined in `people.tsx`

`WorkspaceNav`, `GraphContainer`, `DetailContainer`, and workspace containers are memoized where useful. They limit subtree rerenders, while providers isolate graph/detail updates from the page shell.

### 9.3 Prop fan-out hotspots that remain

- **`GraphContainer` → `PeopleGraph3D`:** five bundle props; **`graphHandlers`** stays stable when only model/status churn (callbacks from graph context + memoised object).
- **`PersonDetailPanel`:** still receives a **wide** prop object internally from **`usePersonDetailPanelProps`**; narrowing rerenders further requires **sibling detail contexts** or section-level memo props.

### 9.4 Completed seams

1. Pure selection helpers live in `people-selection.ts`.
2. `PeopleGraphDataProvider` owns graph data and refresh/layout concerns (**includes `retryGraphData`**).
3. **`PeopleReviewProvider`** owns research tasks, validation findings, and duplicate candidates.
4. **`PersonDetailProviderTree`** remains the documented mount point for selected-person detail providers (`PersonDetailProvider` today).
5. **`usePersonDetailPanelProps`** centralises the former `DetailContainer` prop synthesis; **`PersonDetailPanelWithProps`** preserves explicit-prop tests.
6. **`peopleGraph3dSceneBundles.ts`** documents bundled graph scene props, and **`GraphSceneContext`** carries thumbnail/render LOD data inside the graph scene.
7. Workspace bodies are split/lazy where applicable.

### 9.5 Things to preserve in future splits

- **Save guards** in `refreshGraphData` (`profileDraftDirtyRef`, saving refs).
- **`layoutRequestIdRef`** race handling for `computeGraphLayout`.
- **Selection persistence** effect tied to `savedPreferences` / `onPreferencesChange`.
- **Tree validation debounce** (`400ms`) keyed off `people` / `relationships` / `isLoading`.
- **Accessibility:** `inert` / `aria-hidden` on hidden workspaces (`GraphContainer`, places section, detail placeholder).
- **Rendering alignment:** instanced visuals, per-person hit meshes, and relationship lines must use the same positional snapshot. A previous `useDeferredValue` experiment caused node/line mismatch and was removed.

---

_Last updated: April 30, 2026 — `PeopleReviewProvider`, connected research section, graph scene context, explicit Tier-B relationship life-event tests, line material constants, T1 thumbnail profiling/atlas gate, refreshed line counts, and April 30 architecture review decisions._
