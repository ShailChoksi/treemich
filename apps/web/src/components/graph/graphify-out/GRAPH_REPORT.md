# Graph Report - apps\web\src\components\graph  (2026-08-03)

## Corpus Check
- 87 files · ~37,758 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 417 nodes · 800 edges · 20 communities (19 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dd3f0485`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]

## God Nodes (most connected - your core abstractions)
1. `NodePosition` - 28 edges
2. `computeSuggestions()` - 16 edges
3. `buildParentChildIndex()` - 11 edges
4. `GraphLayoutMode` - 11 edges
5. `pickFocusMembershipIds()` - 9 edges
6. `PersonNodeComponent()` - 7 edges
7. `PersonNodeFallbackComponent()` - 7 edges
8. `distanceSquared()` - 7 edges
9. `positionPeople()` - 7 edges
10. `useGraphVisibility()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `GraphCanvasScene()` --calls--> `useGraphScene()`  [EXTRACTED]
  GraphCanvasScene.tsx → GraphSceneContext.tsx
- `GraphCanvasScene()` --calls--> `useThumbnailLoader()`  [EXTRACTED]
  GraphCanvasScene.tsx → useThumbnailLoader.ts
- `getPositionById()` --calls--> `positionPeople()`  [EXTRACTED]
  layout.spec.ts → layout/positionPeople.ts
- `pickNearestIds()` --calls--> `distanceSquared()`  [EXTRACTED]
  useThumbnailLoader.ts → layout/graphPrimitives.ts
- `computeSuggestions()` --calls--> `buildParentChildIndex()`  [EXTRACTED]
  relationshipSuggestions.ts → layout/graphPrimitives.ts

## Import Cycles
- None detected.

## Communities (20 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (31): useGraphScene(), reactTestEnvironment, AnimatedNodes(), DisplayPerson, Props, resolveNodeRenderTier(), shouldRenderDetailedNode(), shouldRenderInstancedVisualForNode() (+23 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (24): DisplayPerson, GraphCanvasScene(), orbitControlMouseButtons, Props, VisibleLine, buildMergedParentGroups(), buildVisibleRelationshipLines(), candidateParentPairKeys() (+16 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (27): invalidate, reactTestEnv, bitmapCache, clearThumbnailCachesForTests(), evictToCap(), getCachedBitmap(), getCachedBitmapSize(), getCachedTexture() (+19 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (28): avatarGeometry16, avatarGeometry20, avatarGeometryLite, haloMaterialHighlighted, haloMaterialSelected, hitAreaGeometry16, hitAreaGeometry20, hitAreaGeometryLite (+20 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (20): getFocusCameraPose(), buildDirectionalNeighborBuckets(), distanceSquared(), getLastNameKey(), hashToNumber(), inverseRelationshipType(), ParentChildEdge, subtractPosition() (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (21): shouldUseLayoutWorker(), GraphLayoutMode, workerScope, cleanupPendingRequest(), createWorker(), getWorker(), handleWorkerFailure(), handleWorkerMessage() (+13 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (21): buildGraphIndices(), buildSiblingIndex(), buildSpouseIndex(), computeExtendedFamily(), computeFamilyMembers(), computeInLawFamily(), ExtendedFamilyMember, ExtendedFamilyRule (+13 more)

### Community 7 - "Community 7"
Cohesion: 0.13
Nodes (18): GraphSceneContext, GraphSceneContextValue, computeCameraVisibility(), defaultGraphVisibilityThresholds, GraphVisibilityBucket, GraphVisibilityThresholds, resolveVisibilityBucket(), sq() (+10 more)

### Community 8 - "Community 8"
Cohesion: 0.16
Nodes (16): GraphLayerControls(), legendItems, Props, reactTestEnvironment, reactTestEnvironment, createLayoutStateHookProps(), LayoutStateHookOptions, defaultGraphFilterVisibility (+8 more)

### Community 9 - "Community 9"
Cohesion: 0.16
Nodes (17): areCameraControlsAndPersonPositionReady(), consumeGraphCameraSessionKindFromBrowser(), GraphCameraPose, GraphCameraSessionKind, resolveCameraSnapshotForPersistence(), resolvePersistedCameraSnapshot, resolveRestoredCameraSnapshotForCanvas(), resolveStartupCameraIntent() (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (18): addSuggestion(), buildSymmetricPairSet(), computeSuggestions(), getPairPartnersForPerson(), getParentChildKey(), getSiblingKey(), getSortedPair(), getSpouseKey() (+10 more)

### Community 11 - "Community 11"
Cohesion: 0.16
Nodes (15): resolveThumbnailHttpResponse(), workerScope, cleanupPendingRequest(), createWorker(), getWorker(), handleWorkerFailure(), handleWorkerMessage(), pendingById (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (11): AddRelativePopup(), AddRelativeSubmitPayload, getFirstName(), normalizeOptionalString(), Props, slotTitle, people, reactTestEnvironment (+3 more)

### Community 13 - "Community 13"
Cohesion: 0.20
Nodes (5): GraphSearchOverlay, Props, SearchOption, reactTestEnvironment, RenderResult

### Community 14 - "Community 14"
Cohesion: 0.22
Nodes (6): DisplayPerson, NodeInstancedMesh(), NodeRenderTier, Props, tierGeometryConfig, instancedNodeLayerZ

### Community 15 - "Community 15"
Cohesion: 0.25
Nodes (5): controls, Props, reactTestEnvironment, TreeLayoutControls(), TreeLayoutPreferenceKey

### Community 16 - "Community 16"
Cohesion: 0.38
Nodes (4): Harness(), reactTestEnvironment, useGraphCamera(), UseGraphCameraOptions

### Community 17 - "Community 17"
Cohesion: 0.50
Nodes (3): GraphFooterStatus(), Props, reactTestEnv

### Community 18 - "Community 18"
Cohesion: 0.50
Nodes (3): GraphSurfaceOverlays(), Props, reactTestEnvironment

## Knowledge Gaps
- **110 isolated node(s):** `reactTestEnvironment`, `people`, `Props`, `AddRelativeSubmitPayload`, `slotTitle` (+105 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `NodePosition` connect `Community 4` to `Community 0`, `Community 1`, `Community 2`, `Community 5`, `Community 7`, `Community 8`, `Community 9`, `Community 14`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._
- **Why does `AddRelativeSlot` connect `Community 12` to `Community 0`, `Community 1`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `buildParentChildIndex()` connect `Community 6` to `Community 8`, `Community 10`, `Community 4`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `reactTestEnvironment`, `people`, `Props` to the rest of the system?**
  _110 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07272727272727272 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08708708708708708 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.11229946524064172 - nodes in this community are weakly interconnected._