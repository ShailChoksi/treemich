# Sidebar Workspace UI Plan (Implementation-Ready Checklist)

## Status

Deferred. This redesign is not implemented in the current UI. The current people surface uses the workspace shell in `apps/web/src/pages/people.tsx` plus the stacked inspector in `apps/web/src/components/PersonDetailPanel.tsx`.

Revisit this plan after the Phase A workspace cleanup if the stacked inspector becomes a usability blocker. Phase A should not create `PersonSidebarWorkspace`, `sidebarSections`, sidebar section persistence, sidebar badges, or sidebar keyboard navigation.

---

This document breaks the sidebar redesign into concrete, shippable tasks with file-level targets, test scope, rollout, and acceptance criteria.

Scope: `apps/web` only for v1 (no new API contracts required).  
Goal: replace stacked right-panel sections with a scalable section-nav workspace.

---

## 1) Design Decisions (Lock Before Coding)

- [ ] **Pattern:** Sidebar-local nav list + single active content pane (no top tab bar).
- [ ] **Section ids:** `profile`, `relationships`, `events`, `families`, `timeline`, `research`, `evidence`, `gedcom`, `map`.
- [ ] **Default section:** `profile`.
- [ ] **Persistence:** store `lastSidebarSection` in user preferences.
- [ ] **Visibility rules:** feature-flagged sections remain hidden/disabled when APIs are unavailable.
- [ ] **Initial mode:** single-section view only (no “All sections” in v1).

---

## 2) Target File Map

Primary files expected to change:

- `apps/web/src/pages/people.tsx`
- `apps/web/src/components/PersonDetailPanel.tsx`
- `apps/web/src/components/personDetail/*` (composition only where needed)
- `apps/web/src/components/EvidenceLibrariesSection.tsx` (mount location only)
- `apps/web/src/components/EvidenceMediaSection.tsx` (mount location only)
- `apps/web/src/components/GedcomInterchangeSection.tsx` (mount location only)
- `apps/web/src/components/MapPlacesPanel.tsx` (mount location only)
- `apps/web/src/lib/api.ts` (only if preference payload needs extension)
- `apps/web/src/styles.css`
- tests:
  - `apps/web/src/pages/people.spec.ts`
  - `apps/web/src/pages/people-page.integration.spec.tsx`
  - add: `apps/web/src/components/PersonSidebarWorkspace.spec.tsx` (new)

New files:

- `apps/web/src/components/personDetail/PersonSidebarWorkspace.tsx`
- `apps/web/src/components/personDetail/sidebarSections.ts` (section metadata/types)

---

## 3) PR Slicing Strategy

## PR 1 — Workspace Shell + Section Switching

### Implementation checklist

- [ ] Add `SidebarSectionId` union type in `sidebarSections.ts`.
- [ ] Add section metadata map (`label`, `order`, optional `isAvailable` function).
- [ ] Create `PersonSidebarWorkspace.tsx`:
  - [ ] left nav list
  - [ ] active section state
  - [ ] right content pane render
  - [ ] section header slot (title + optional CTA area)
- [ ] Move existing right sidebar composition in `people.tsx` into workspace sections.
- [ ] Ensure each section still receives the exact props it had before.
- [ ] Keep old stacked markup removed (not hidden duplicate).
- [ ] Add minimal responsive behavior (works at current sidebar width).

### Tests

- [ ] Unit: section click changes active pane.
- [ ] Unit: default active section is `profile`.
- [ ] Integration: existing person interactions still work after section switch.

### Acceptance criteria

- [ ] Users can navigate all sections from nav.
- [ ] No existing CRUD action regresses.
- [ ] No TypeScript/lint errors.

---

## PR 2 — Persistence + Badges + Availability

### Implementation checklist

- [ ] Persist `lastSidebarSection` via existing preferences flow.
- [ ] Restore section on reload.
- [ ] Fallback to `profile` if stored section unavailable.
- [ ] Add nav badges:
  - [ ] validation issue count
  - [ ] unmatched GEDCOM count (when preview state exists)
  - [ ] optional research open-task count
- [ ] Availability rules:
  - [ ] GEDCOM import: if probe says unavailable, keep section but show disabled import controls + message.
  - [ ] Map section hidden/disabled when `mapUiEnabled` false.
  - [ ] Evidence section visibility follows `VITE_EVIDENCE_MANAGEMENT_UI`.

### Tests

- [ ] Unit: restore section from preference.
- [ ] Unit: unavailable section falls back to `profile`.
- [ ] Unit: badge values render correctly.

### Acceptance criteria

- [ ] Section preference persists across refresh.
- [ ] Badge counts update live with data changes.
- [ ] Disabled sections are clear and non-broken.

---

## PR 3 — UX Polish + Accessibility + Keyboard

### Implementation checklist

- [ ] Keyboard navigation in nav list (arrow keys + enter/space).
- [ ] Focus management on section switch (header or first control).
- [ ] ARIA roles/labels:
  - [ ] nav landmark
  - [ ] active section state (`aria-current`/selected semantics)
  - [ ] pane labeling
- [ ] Sticky nav and independent pane scrolling.
- [ ] Add section-level loading/error affordances where needed.
- [ ] Improve narrow-width behavior:
  - [ ] icon+label truncation or compact mode
  - [ ] no overlap/cutoff with long labels

### Tests

- [ ] Accessibility smoke tests (keyboard section switching).
- [ ] Snapshot/integration for compact layout.

### Acceptance criteria

- [ ] Keyboard-only user can reach and switch sections.
- [ ] No major visual regressions on common viewport sizes.

---

## 4) Section Definition (v1)

- [ ] **Profile**: core person fields/names quick edits.
- [ ] **Relationships**: add/edit/remove relationships.
- [ ] **Life Events**: person + relationship events editing.
- [ ] **Families**: family units + family life events.
- [ ] **Timeline**: person timeline display.
- [ ] **Research**: tasks list/actions.
- [ ] **Evidence**: repositories/sources/media.
- [ ] **GEDCOM**: import/export workflows.
- [ ] **Map**: places panel and include-living toggle.

Note: keep section boundaries stable so future features can attach without reshuffling every release.

---

## 5) Data/State Structure Checklist

- [ ] Introduce local `sectionState` model (active, available, badge, dirty/loading optional).
- [ ] Avoid passing entire page state into each section if not needed.
- [ ] Keep API calls where they are initially; refactor to section hooks later only if necessary.
- [ ] Ensure no hidden-mounted section keeps expensive polling running unintentionally.

---

## 6) Migration Safety Checklist

- [ ] Verify no behavior tied to DOM order breaks (tests + manual).
- [ ] Preserve existing feature flags and conditions.
- [ ] Preserve GEDCOM and evidence import/export controls exactly.
- [ ] Preserve map focus-person callback wiring.
- [ ] Preserve status/error toasts/messages currently surfaced in `people.tsx`.

---

## 7) QA Checklist (Manual)

- [ ] Switch people while on each section; no crashes.
- [ ] Edit data in each section; save behavior unchanged.
- [ ] GEDCOM import preview + matching + apply still works.
- [ ] GEDCOM export buttons still work.
- [ ] Evidence create/merge/media flows still work.
- [ ] Map focus action still centers selected person in graph.
- [ ] Validation badge updates when issues change.
- [ ] Refresh browser; last section restored.

---

## 8) Future-Proofing (Post-v1 backlog)

- [ ] Optional “All sections” mode for power users.
- [ ] Grouped nav headers: Core / Research / Evidence / Exchange / Quality.
- [ ] Validation dashboard section (tree-wide findings).
- [ ] Duplicate merge queue section.
- [ ] Reports section (Phase 6).
- [ ] Import history/audit section for GEDCOM jobs.

---

## 9) Definition of Done (overall)

- [ ] PR1–PR3 complete and merged.
- [ ] `npm run lint` passes at repo root.
- [ ] Web test suite green.
- [ ] No critical UX regressions in right sidebar workflows.
- [ ] Documentation updated:
  - [ ] `docs/genealogy-phases-completion-analysis.md` note added that sidebar architecture supports Phase 6+ UI expansion.
