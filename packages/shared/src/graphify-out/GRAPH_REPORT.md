# Graph Report - packages\shared\src  (2026-08-03)

## Corpus Check
- 12 files · ~12,696 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 326 nodes · 359 edges · 16 communities (13 shown, 3 thin omitted)
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
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]

## God Nodes (most connected - your core abstractions)
1. `positionGenerationTreePeople()` - 9 edges
2. `buildTreePositions()` - 5 edges
3. `enumerateCandidateUnitKeys()` - 4 edges
4. `buildFamilyUnitsForComponent()` - 4 edges
5. `buildGraphLayoutRevision()` - 4 edges
6. `derivePairsByType()` - 3 edges
7. `deriveSpousePairs()` - 3 edges
8. `deriveSiblingPairs()` - 3 edges
9. `sortPersonIdsByName()` - 3 edges
10. `familyUnitKeyFromParents()` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- 1-file cycle: `lifeEvents.js -> lifeEvents.js`

## Communities (16 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (84): AuthState, AuthUser, CooccurrenceEdgeRecord, CooccurrenceEdgesResponse, CooccurrenceJobResponse, CooccurrenceJobStatus, cooccurrenceJobStatusSchema, cooccurrenceJobStatusValues (+76 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (35): applyStaircaseOffsets(), BuchheimNode, buildComponentCenters(), buildFamilyUnitsForComponent(), buildParentChildIndex(), buildStaircaseOffsetsById(), buildTreePositions(), collectAncestorDistances() (+27 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (35): depthReportParametersSchema, DescendantFamilyGroup, descendantFamilyGroupSchema, DescendantReportRequest, DescendantReportResponse, descendantReportResponseSchema, FamilyGroupSheetRequest, familyGroupSheetRequestSchema (+27 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (33): CreateFamilyLifeEventBody, createFamilyLifeEventBodySchema, CreateLifeEventBody, createLifeEventBodySchema, dateQualifierSchema, DateQualifierValue, dateQualifierValues, daySchema (+25 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (27): CreateMediaLinkBody, createMediaLinkBodySchema, CreateMediaObjectBody, createMediaObjectBodySchema, CreateRepositoryBody, createRepositoryBodySchema, CreateSourceBody, createSourceBodySchema (+19 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (18): MergePeopleBody, mergePeopleBodySchema, PatchPersonDuplicateCandidateBody, patchPersonDuplicateCandidateBodySchema, PersonDuplicateCandidateRecord, PersonDuplicateCandidateStatus, personDuplicateCandidateStatusSchema, personDuplicateCandidateStatusValues (+10 more)

### Community 6 - "Community 6"
Cohesion: 0.15
Nodes (15): RelationshipType, AgeFilter, ageSuffixPatterns, InterpreterIntent, InterpreterResult, MatcherEntry, matchers, normalizeName() (+7 more)

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (13): PatchValidationFindingBody, patchValidationFindingBodySchema, ValidationFindingDisplayContext, ValidationFindingListQuery, validationFindingListQuerySchema, ValidationFindingRecord, ValidationFindingSeverity, validationFindingSeveritySchema (+5 more)

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (11): CreateFamilyBody, createFamilyBodySchema, familyChildInputSchema, FamilyChildPedigree, familyChildPedigreeSchema, familyChildPedigreeValues, FamilyChildRecord, FamilyRecord (+3 more)

### Community 9 - "Community 9"
Cohesion: 0.18
Nodes (9): CreatePersonNameBody, createPersonNameBodySchema, optStr, PatchPersonNameBody, patchPersonNameBodySchema, personNameTypeLabels, personNameTypeSchema, PersonNameTypeValue (+1 more)

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (10): CreateResearchTaskBody, createResearchTaskBodySchema, PatchResearchTaskBody, patchResearchTaskBodySchema, ResearchTaskQuery, researchTaskQuerySchema, ResearchTaskRecord, ResearchTaskStatus (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.50
Nodes (4): buildGraphLayoutRevision(), filterGraphLayoutTopologyRelationships(), hashString(), resolveTreeLayoutPreferences()

## Knowledge Gaps
- **259 isolated node(s):** `createRepositoryBodySchema`, `patchRepositoryBodySchema`, `createSourceBodySchema`, `patchSourceBodySchema`, `sourceListQuerySchema` (+254 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dateQualifierSchema` connect `Community 3` to `Community 2`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Why does `lifeEventTypeSchema` connect `Community 3` to `Community 2`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Why does `RelationshipType` connect `Community 6` to `Community 0`, `Community 1`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `createRepositoryBodySchema`, `patchRepositoryBodySchema`, `createSourceBodySchema` to the rest of the system?**
  _259 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.022988505747126436 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05782312925170068 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._