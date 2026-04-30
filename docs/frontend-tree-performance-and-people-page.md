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

| Path                                                 | Role                                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/web/src/components/PeopleGraph3D.tsx`          | Memoized shell: layout hook, camera, keyboard, overlays, passes props into `GraphCanvasScene` |
| `apps/web/src/components/graph/GraphCanvasScene.tsx` | R3F `<Canvas>`, lights, `OrbitControls`, lines, `AnimatedNodes`, thumbnail pipeline hooks     |
| `apps/web/src/components/graph/AnimatedNodes.tsx`    | Maps visible people to tiered node groups (detailed / thumbnail / minimal)                    |
| `apps/web/src/components/graph/PersonNode.tsx`       | Per-person Three content: thumbnail ring, hit mesh, labels; `memo` on variants                |

### Layout and visibility

| Path                                                      | Role                                                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/graph/useGraphLayoutState.ts`    | Large hook: server vs worker vs sync layout, topology cache, progressive render limit, camera buckets, visible people/lines |
| `apps/web/src/components/graph/layout.ts`                 | Re-exports `positionPeople` and types                                                                                       |
| `apps/web/src/components/graph/layout.worker.ts`          | Worker entry: runs `positionPeople`, posts positions                                                                        |
| `apps/web/src/components/graph/layoutWorkerClient.ts`     | Main-thread RPC, timeouts (~12s), pending map by request id                                                                 |
| `apps/web/src/components/graph/useGraphLayoutWorker.ts`   | Hook around worker client with sync fallback                                                                                |
| `apps/web/src/components/graph/graphLayoutConstants.ts`   | e.g. worker threshold **320** people                                                                                        |
| `apps/web/src/components/graph/topologyLayoutCache.ts`    | Insertion-ordered cache, cap **8** topology entries                                                                         |
| `apps/web/src/components/graph/graphVisibility.ts`        | Camera LOD: **near / mid / far / culled** + hysteresis; minimum visible when culled                                         |
| `apps/web/src/components/graph/graphRelationshipLines.ts` | Edge segments from relationships + merged parent groups                                                                     |
| `apps/web/src/components/graph/layout/*`                  | Buchheim-style family tree, photo layout, overlap, naming, etc.                                                             |

### Motion, camera sampling, GL setup

| Path                                                                                                            | Role                                                                                             |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `apps/web/src/components/graph/scene/useAnimatedNodeTransforms.ts`                                              | `useFrame` lerp of node groups to targets; large-graph mode skips non-priority every other frame |
| `apps/web/src/components/graph/scene/useOrbitPositionSync.ts`                                                   | Samples camera for culling: **throttled ~90ms**, min distance **0.2**                            |
| `apps/web/src/components/graph/scene/createWebGlRenderer.ts`                                                    | WebGL2 renderer factory                                                                          |
| `apps/web/src/components/graph/useGraphCamera.ts`, `useGraphCameraControls.ts`, `useGraphKeyboardNavigation.ts` | Framing, focus, arrow navigation                                                                 |

### Thumbnails

| Path                                                      | Role                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/web/src/components/graph/useThumbnailLoader.ts`     | Batches loads, camera ordering, backoff; coordinates with worker       |
| `apps/web/src/components/graph/thumbnailCache.ts`         | Module-level `Map` caches (textures / bitmaps), cap **1000**, eviction |
| `apps/web/src/components/graph/thumbnailLoader.worker.ts` | `fetch` + `createImageBitmap` off main thread                          |
| `apps/web/src/components/graph/thumbnailWorkerClient.ts`  | RPC to thumbnail worker                                                |

### Page integration

| Path                            | Role                                                                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/pages/people.tsx` | **`PeoplePage`**: fetches people/relationships/preferences, `refreshGraphData`, server layout, all workspace state, passes dozens of props to graph + detail + secondary workspaces |
| `apps/web/src/lib/api.ts`       | `getPeople`, `getRelationships`, `computeGraphLayout` (`POST /graph/layout`), etc.                                                                                                  |

---

## 3. Data flow: API → tree (explicit)

1. **`App.tsx`** loads user, lazy-loads **`PeoplePage`**.
2. **`PeoplePage`** on mount calls **`refreshGraphData()`** (and related effects).
3. **`refreshGraphData`** (in `people.tsx`):
   - `Promise.all([ getPeople(), getRelationships(), getUserPreferences().catch(...) ])`
   - Sorts people and relationships stably (`sortPeopleStable`, `sortRelationshipsStable`).
   - Updates `people` / `relationships` (with **`samePeopleList` / `sameRelationshipList`** to avoid new array references when semantically unchanged).
   - Clears many derived maps (life events, timeline, research, families, etc.).
   - Rebuilds `genderByPersonId`, `givenNameByPersonId`, `surnameByPersonId`, `nicknamesByPersonId` from sorted people.
   - **`resolvePeopleSelection`** → `setSelectedPersonId`, `setGraphCameraFocusPersonId`.
   - Increments **`layoutRequestIdRef`**, clears `serverLayout`, then **`computeGraphLayout({...})`** (async `.then` / `.catch`) → **`setServerLayout`** or error + local layout fallback message.
4. **`GraphContainer`** (memo, in `people.tsx`) wraps **`PeopleGraph3D`** when workspace is tree; passes `serverPositionsByPersonId` from `serverLayout`, plus people, relationships, selection, prefs callbacks, `layoutResizeSignal`, etc.
5. **`PeopleGraph3D`** filters people/relationships if needed, calls **`useGraphLayoutState`** with server positions + revision + camera position + render limit (**starts at 120**, grows by **120** every **150ms** until full — progressive reveal).
6. **`useGraphLayoutState`**:
   - If server layout is **complete** and revision matches → use server positions.
   - Else topology cache (8 entries) → else **worker** if people count **≥ 320** → else **sync `positionPeople`** on main thread.
   - Applies focus offset, pinned-person slot search, **`computeCameraVisibility`**, builds visible people and line list.
7. **`GraphCanvasScene`** mounts Canvas, restores graph UI snapshot from props/state, renders **one `<Line>` per visible edge** (Drei), **`AnimatedNodes`** for each visible person, starts thumbnail batching (**batch size 5**, **750ms** interval between batches in loader logic).
8. **Thumbnails:** worker → bitmap → texture → module cache → `PersonNode` reads cache / fade-in material.

**`refreshPeopleOnly`:** exists separately — **`getPeople()`** only, updates `people` without full graph refresh (used e.g. after name changes from detail panel).

---

## 4. Optimizations already present

- **React:** `memo` on `PeopleGraph3D`, `GraphContainer`, `DetailContainer`, `WorkspaceNav`, `ToastViewport`, `PersonDetailPanel` (where used), graph leaf nodes.
- **Stable list equality:** `samePeopleList`, `sameRelationshipList` reduce prop churn into the graph.
- **Layout:** server layout when available; topology cache; **Web Worker** for large graphs; **request id** discard for stale layout responses.
- **Visibility:** 4-bucket camera LOD + hysteresis; progressive **render limit**; **`pickNearest`** when over limit.
- **GPU:** `frameloop="demand"`; `dpr` cap; large-graph **frame skipping** for non-priority node lerps.
- **Thumbnails:** worker decode; **module cache** with cap; exponential backoff on failures; camera-proximity ordering.
- **Resize:** `ResizeObserver` on `.workspace-main-views` → **RAF**-guarded bump of **`layoutResizeSignal`** for canvas refresh.
- **Persistence:** debounced (~**350ms**) localStorage for graph/map UI snapshots (see code in `people.tsx`).
- **Async safety:** many **`useRef`** mirrors for guards (`profileDraftDirtyRef`, save flags, `selectedPersonIdRef`, layout request id, map request id); **AbortController** patterns in lazy loads for person-scoped data (effects in `people.tsx`).

---

## 5. Gaps and risks (explicit)

| Gap                                                        | Why it matters                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No `InstancedMesh`** for identical node disks            | Each visible person = full Three group hierarchy; cost grows with visible count (~1000+).                                                                                                                                                                            |
| **One Drei `<Line>` per relationship**                     | Many draw calls / objects vs one batched line geometry.                                                                                                                                                                                                              |
| **`refreshGraphData` always full reload**                  | Every mutation path that calls it refetches **all** people + **all** relationships (paginated, **1000/page**) + server layout; high latency and main-thread work even for tiny edits.                                                                                |
| **`useGraphLayoutState` surface**                          | Very large hook (many parameters/returns); three layout backends intertwined with visibility + progressive render.                                                                                                                                                   |
| **`PeoplePage` monolith**                                  | **~2572 lines**, **43 `useState`** calls in `PeoplePage` (plus inner memo components with no state), **20+ `useRef`**, **many `useCallback`/`useEffect`**; **any** `useState` update re-renders the whole page subtree that is not blocked by `memo` + stable props. |
| **No `useDeferredValue` / `startTransition`** on hot paths | Could soften interaction during heavy updates (optional future).                                                                                                                                                                                                     |

**Note:** Earlier estimates of “120+ useState” were overstated; the grep count included nested scopes — the **`PeoplePage` body has 43 `useState` declarations** (verified grep on `people.tsx`).

---

## 6. `refreshGraphData` call sites (for granular-invalidation work)

Grep in `people.tsx` for `refreshGraphData` shows use after: mount effect, family patch/delete, create/delete person, thumbnails, Immich link/unlink, relationships, duplicate merge, GEDCOM/Immich import callbacks, retry handlers, life-event flows that touch graph, etc. **Treat the full list as the contract surface** when introducing partial refresh — every caller assumes post-call invariants today.

---

## 7. Tests touching this area

| File                                                  | What it covers                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/web/src/pages/people.spec.ts`                   | **`findBestPersonMatchByName`**, **`resolvePeopleSelection`**, re-exports from `lifeEventUi` |
| `apps/web/src/pages/people-page.integration.spec.tsx` | Integration around `PeoplePage` / workspaces (verify if expanded)                            |
| `apps/web/src/components/PeopleGraph3D.spec.tsx`      | Graph component behavior                                                                     |

Refactors of **`PeoplePage`** should keep **`people.spec.ts`** imports working (move pure helpers to `people-selection.ts` or similar if the page file shrinks).

---

## 8. Deepening opportunities (numbered backlog)

1. **Split `PeoplePage`:** providers or composition per workspace; narrow hooks (`usePeopleGraphData`, `useWorkspaceLayout`, etc.) so unrelated state does not re-render the full page.
2. **Granular data updates:** replace or supplement `refreshGraphData` with optimistic / targeted patches per mutation type.
3. **Layout orchestrator module:** extract server / worker / sync chain behind a small interface; keep `useGraphLayoutState` for visibility + progressive UI only.
4. **`InstancedMesh`** (or equivalent) for shared node geometry at scale.
5. **Batched relationship line geometry** instead of N `<Line>` components.

---

## 9. Item 1 — Monolithic `people.tsx` (exploration notes)

See **§5** and **§8.1**. Concrete facts for refactor planning:

### 9.1 State inventory (`PeoplePage` only, lines ~423–508)

Workspace chrome: `activeWorkspace`, `leftPaneOpen`, `contextPaneOpen`, `layoutResizeSignal`.

Graph core: `people`, `relationships`, `selectedPersonId`, `graphFocusPersonId`, `graphCameraFocusPersonId`, `genderByPersonId`, `givenNameByPersonId`, `surnameByPersonId`, `nicknamesByPersonId`, `profileEventFieldsByPersonId`, `lifeEventsByPersonId`, `relationshipLifeEventsById`, `status`, `isLoading`, `loadError`, `isSavingProfile`, `isSavingRelationship`, `isSavingSearchPreferences`, `showCreatePersonDialog`, `isCreatingPerson`, `savedPreferences`, `serverLayout`, `graphLayoutError`, `treeValidationIssueCount`, `treeValidationEngineDisabled`, `personTimelineById`, `researchTasksByPersonId`, `allResearchTasks`, `allResearchTasksLoading`, `validationFindings`, `validationFindingsLoading`, `duplicateCandidates`, `duplicateCandidatesLoading`, `familiesByPersonId`, `savingFamilyId`, `familyMediaLinksById`, `evidenceMediaObjects`, `familyLifeEventsById`, map: `mapPlaces`, `mapIncludeLiving`, `mapLoading`, `mapUiEnabled`, `mapLoadError`, `graphUiSnapshot`, `mapUiSnapshot`, `toasts`.

### 9.2 Child components defined in the same file

`ToastViewport`, `WorkspaceNav`, `GraphContainer`, `DetailContainer` — already memoized; they **limit** rerender cost but **do not** stop `PeoplePage` from running the full hook body on every state change.

### 9.3 Prop fan-out hotspots

- **`GraphContainer` → `PeopleGraph3D`:** ~20+ props including callbacks; memo helps only when references and primitives are stable.
- **`DetailContainer` → `PersonDetailPanel`:** single `detailProps` object **recreated every render** — this is a likely **silent memo breaker** for `DetailContainer` unless `PersonDetailPanel` is deeply memoized internally.

### 9.4 Recommended first seams (lowest risk → highest leverage)

1. **Extract pure helpers** already exported (`findBestPersonMatchByName`, `resolvePeopleSelection`) to `people-selection.ts` — zero behavior change; shrinks `people.tsx` and clarifies tests.
2. **`PeopleGraphDataProvider`** (React context): owns `people`, `relationships`, `serverLayout`, `refreshGraphData`, `isLoading`, `loadError`, `savedPreferences` slice used by graph — **`PeoplePage` shell** rerenders less when e.g. map or research state changes.
3. **`PersonDetailPanel` props:** memoize `detailProps` with **`useMemo`** keyed on real inputs, or split panel into a wrapper that subscribes to a small context — **fixes object identity churn**.
4. **Lazy workspace bodies:** mount `ResearchWorkspace` / `DuplicateReviewWorkspace` / etc. only when `activeWorkspace` matches (or `lazy()` + `Suspense`) — reduces initial effect and hook work.

### 9.5 Things to preserve in any split

- **Save guards** in `refreshGraphData` (`profileDraftDirtyRef`, saving refs).
- **`layoutRequestIdRef`** race handling for `computeGraphLayout`.
- **Selection persistence** effect tied to `savedPreferences` / `onPreferencesChange`.
- **Tree validation debounce** (`400ms`) keyed off `people` / `relationships` / `isLoading`.
- **Accessibility:** `inert` / `aria-hidden` on hidden workspaces (`GraphContainer`, places section, detail placeholder).

---

_Last updated from codebase audit: April 2026._
