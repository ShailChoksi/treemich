# Genealogy phases 1–5: completion analysis

This document records **why** the rolled-up plan marks some Phase 1–5 streams as **Partial** (vs **Yes**), what **finishing** them typically involves, and **blockers**. It complements the source plan **“Genealogy feature gap analysis”** (e.g. `genealogy_feature_gap_analysis_0122440a.plan.md` in your Cursor `plans` folder) and the per-phase **Completion status** tables there. Check that plan file for authoritative tables and line-by-line status.

**How to use:** Treat **Yes** as “shipped for Treemich’s MVP scope.” **Partial** usually means _gap vs a desktop-genealogy ideal_, _optional polish_, _different architecture than the plan’s example_, or _unverified_ behavior—not necessarily that the feature is missing.

---

## Cross-phase summary

| Phase | Substantive status (plan)      | Partial rows in completion table | Dominant reason for partials                                                               |
| ----- | ------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------ |
| **1** | Complete                       | 1 (NL vs alternate names)        | NL search across `PersonName` not verified; optional follow-up                             |
| **2** | Complete                       | 1 (Geocoding)                    | Pipelines/flags exist; not “every place auto-filled” by default                            |
| **3** | Complete                       | 0 (all Yes)                      | Extensions called out only under “Remaining (explicit)”                                    |
| **4** | Complete                       | 1 (Graph)                        | Optional 3D **visual** styling by pedigree; model/API/UI are Yes                           |
| **5** | Complete for match-only GEDCOM | Several                          | Bar set at Gramps-class toolchain + infra (signed URLs, workers, full CI, Immich identity) |

---

## Phase 1 — Event vocabulary, alternate names, read-only validation

**Plan exit:** Event types and `customLabel` round-trip; alternate names editable; validation surfaces real issues on bad synthetic data.

### Completion table: partials

| Stream                              | Met?        | Why partial (if applicable)                                                                                            | Effort to close                                                             | Blockers                                  |
| ----------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| Event types + `CUSTOM`              | Yes         | —                                                                                                                      | —                                                                           | —                                         |
| UI / rich life-event editor         | Yes         | —                                                                                                                      | —                                                                           | —                                         |
| Alternate names                     | Yes         | —                                                                                                                      | —                                                                           | —                                         |
| **Graph / NL primary vs alt names** | **Partial** | Primary display wired; **NL interpreter searching alternate `PersonName` rows** called out in plan as **not verified** | Low–medium: include alternate names in NL search or query expansion + tests | None hard; product rules for ranking/perf |
| Validation (read-only)              | Yes         | —                                                                                                                      | —                                                                           | —                                         |

### Remaining (explicit) — not all in table

- **Broader GEDCOM event vocabulary** than current enum: medium–high (enum growth + migrations) or high (string GEDCOM tags + rules).
- **Persisted** `ValidationFinding` + optional **nightly** job: medium (schema, invalidation, scheduler).
- Richer **event-type taxonomy / icons**: low–medium (UX).

---

## Phase 2 — Research tasks, timeline, map

**Plan exit:** Tasks CRUD stable; timeline shows event types; map acceptable at ~500 pins (plan suggests a load-test harness; not required to be checked in).

### Completion table: partials

| Stream         | Met?        | Why partial (if applicable)                                                                                                  | Effort to close                                                  | Blockers                                   |
| -------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| Research tasks | Yes         | —                                                                                                                            | —                                                                | —                                          |
| Timeline       | Yes         | —                                                                                                                            | —                                                                | —                                          |
| Map            | Yes         | —                                                                                                                            | —                                                                | —                                          |
| **Geocoding**  | **Partial** | Nominatim (or similar) + scripts **exist**; **not** all places auto-geocoded without **enabling flags** and **running jobs** | Low: docs/defaults; medium: queue + rate limits + production ops | External API ToS/limits; operator API keys |

### Remaining (explicit)

- **Global** research-task hub page: medium (new UI surface).
- Formal **~500 pin** load test artifact: low–medium.
- Stronger **living-person map redaction** policy: medium; **legal/product** as much as code.

---

## Phase 3 — Repositories, sources, citations, media

**Plan exit:** Shared sources, citations on life events, media openable; migration path from older citation shape (already consolidated in schema).

### Completion table: partials

**None** — all streams **Yes**.

### Remaining (explicit)

- **`MediaLinkTargetType` for `Family`** (or other subjects): medium — schema, UI, GEDCOM alignment (overlaps Phase 5).
- **Deduplication UX** beyond merge-sources API: medium.
- **Signed URLs / object storage** hardening for large evidence files: medium–high (infra, security, cost).

---

## Phase 4 — Family, pedigree, NL/graph

**Plan exit:** Manual spot-checks; Phase 5a emits **FAM** in GEDCOM (see Phase 5 / writer).

### Completion table: partials

| Stream                                                                    | Met?        | Why partial (if applicable)                                                                                                                     | Effort to close                                                                 | Blockers                                                  |
| ------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| ADR 0001, schema, migration, life events, API, UI, NL, account `families` | Yes         | —                                                                                                                                               | —                                                                               | —                                                         |
| **Graph**                                                                 | **Partial** | **Layout** uses parent/child edges; **optional pedigree-specific 3D edge styling** (e.g. non-biological dashed) may be incomplete or unverified | Low–medium: pass `pedigree` / `familyId` into graph line style + legend + tests | UX (clutter, accessibility); 3D perf tuning, not platform |

### Remaining (explicit)

- Graph polish as above; optional **dry-run / preview UI** for Phase 4 **backfill** (CLI + logs today): medium.
- **`Family.externalIds.gedcomFam`**: plan marks **done** (migration 0020); behavior tied to GEDCOM in Phase 5.

---

## Phase 5 — GEDCOM export (5a) and import (5b)

**Plan exit:** Interoperability; export before import; match-only import into **existing** Immich-linked profiles.

**Product constraint:** People are **Immich** identities; “create person from GEDCOM” is out of scope unless **Immich APIs** and product sign-off exist.

### Completion table: partials (high level)

| Stream                                        | Met?                      | Why partial                                                                                                                        | Effort to close                                       | Blockers                                |
| --------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------- |
| 5a writer, xref sidecar, `GET /export/gedcom` | Yes / Partial where noted | Core export shipped                                                                                                                | —                                                     | —                                       |
| **5a Async export job + “download URL”**      | **Partial**               | **Jobs + session-auth `GET …/ged`** exist; **not** presigned / anonymous one-shot URLs; result stored in DB with byte cap          | Medium–high: object storage, TTL, token routes        | Product + infra + security              |
| **5a Golden / round-trip tests**              | **Partial**               | Writer snapshots + `gedcom-round-trip.spec` + minimal fixture; **no** Gramps corpus; **no** full **live-DB** export→import→diff CI | Medium: more fixtures; high: e2e DB harness           | CI cost, flakiness control              |
| 5a observability                              | Yes                       | —                                                                                                                                  | —                                                     | —                                       |
| 5b parser                                     | Yes                       | **ANSEL** rejected, not transcoded                                                                                                 | Medium: ANSEL decoder + tests                         | Library choice, edge cases              |
| **5b Async import + polling**                 | **Partial**               | **In-process** worker vs separate queue worker in plan’s “ideal”                                                                   | Medium: Redis/BullMQ-style worker, retries, DLQ       | Deployment topology                     |
| **5b Line / error log**                       | **Partial**               | Capped **JSON** `lineLog`, not a verbatim per-line file                                                                            | Low–medium                                            | Storage/PII if logging raw lines        |
| 5b matching + apply (existing people)         | Yes                       | Unmatched INDI: **no** Immich create                                                                                               | High: **Immich create-person** or shadow INDI         | **Immich** API + product                |
| **5b Transactional bulk apply**               | **Partial**               | Per-entity writes + conflict skip, **not** one global transaction for whole `.ged`                                                 | High: staging + promote, or long single tx (timeouts) | DB transaction duration, UX on rollback |
| **5b Idempotent re-import**                   | **Partial**               | `gedcomIndi` + `gedcomFam` when present; edge cases can still duplicate                                                            | Low–medium: stricter FAM key policy                   | Data modeling judgment                  |
| 5b Matching wizard UI                         | Yes (per updated plan)    | Web interchange for preview + match + job                                                                                          | —                                                     | —                                       |

### Remaining (explicit) — themes

- **Immich** create-person or **shadow** profiles for unmatched INDI.
- **Presigned / anonymous** download for async export.
- **Gramps-scale** golden files + **live-DB** export→import→diff in CI.
- **ANSEL** transcoding (vs reject-only).
- **OBJE** binary ingest beyond URL/string.
- **Single-transaction** or structured **dry-run diff** for power users.

---

## Tracking

| Follow-up                             | Suggested owner      | Suggested signal                            |
| ------------------------------------- | -------------------- | ------------------------------------------- |
| Verify NL + alternate names (Phase 1) | Product + backend    | E2E or unit tests on search                 |
| Geocoding defaults & ops (Phase 2)    | Ops                  | Runbooks, metrics, rate limits              |
| Media on `Family` (Phase 3)           | Product + full-stack | ADR + schema                                |
| Graph pedigree styling (Phase 4)      | Frontend             | Screenshot/QA checklist                     |
| GEDCOM partials (Phase 5)             | Platform + product   | Roadmap; Immich contact for people creation |

---

_Derived from the Cursor plan “Genealogy feature gap analysis” and the Treemich codebase as of the analysis date. Update this file when major phase scope changes ship._
