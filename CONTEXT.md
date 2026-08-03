# Domain Glossary

## Person identity

The canonical identifier for a person in Treemich. Represented by `PersonProfile.id` and exposed through APIs as `personId`. Core genealogy Modules (life events, relationships, names, families, research tasks) resolve and store only this canonical id.

**Provider identity** is a separate, optional concept — an external identifier stored in `PersonExternalIdentity.providerPersonId` used solely by import/provider Adapter paths (GEDCOM import, Immich linking) for translation into canonical person identity before invoking core genealogy Modules.

**ProfileResolver** is the Adapter at the identity Seam: it resolves a user-scoped `personId` to the canonical `PersonProfile.id` or rejects it. Core genealogy Modules inject the ProfileResolver rather than performing provider-id fallback themselves.

## Language

**Focus mode**:
A family-graph viewing mode that shows only the kinship neighborhood of a Focus Anchor.
_Avoid_: single family view (ambiguous with the Family record), single-family-tree checkbox (UI remnant)

**Focus Anchor**:
The Person the Focus mode neighborhood is rooted on. May follow the current selection or be locked for the session.
_Avoid_: selected person (selection can move while a locked anchor stays put)

**Bloodline**:
The Focus Anchor's ancestors and descendants reached via parent/child relationships (`PARENT_OF` / `CHILD_OF`).
_Avoid_: family line (vague), connected component (graph islands, not kinship direction)

**Collateral depth**:
How many generations of descendants to include from each sibling of a Bloodline person in Focus mode. Zero means those siblings appear without their children.
_Avoid_: cousin mode, extended family (vague)

**Family**:
A GEDCOM-style union of up to two parents with children and pedigree types — a stored record, not a graph viewing mode.
_Avoid_: using Family to mean Focus mode or the whole tree

