# Domain Glossary

## Person identity

The canonical identifier for a person in Treemich. Represented by `PersonProfile.id` and exposed through APIs as `personId`. Core genealogy Modules (life events, relationships, names, families, research tasks) resolve and store only this canonical id.

**Provider identity** is a separate, optional concept — an external identifier stored in `PersonExternalIdentity.providerPersonId` used solely by import/provider Adapter paths (GEDCOM import, Immich linking) for translation into canonical person identity before invoking core genealogy Modules.

**ProfileResolver** is the Adapter at the identity Seam: it resolves a user-scoped `personId` to the canonical `PersonProfile.id` or rejects it. Core genealogy Modules inject the ProfileResolver rather than performing provider-id fallback themselves.

## Language

**Canonical birth**:
The earliest created `BIRTH` life event on a person (`createdAt`, then `id`). It is that person's birthday.
_Avoid_: profile birth date, a later `BIRTH` event, whichever `BIRTH` an unordered query returns first

**Undated canonical birth**:
A canonical birth whose year, month, and day are all empty.
_Avoid_: missing birthday (also used for an empty provider value)

**Dated canonical birth**:
A canonical birth with a year, a month, or a day already set, including a partial date.
_Avoid_: exact birthday (the qualifier may be something other than `EXACT`)

**Birthday conflict**:
A dated canonical birth whose year, month, and day are not the provider's full date. The Treemich date stays.
_Avoid_: equal calendar dates with different qualifiers, an undated canonical birth

**Absent provider birthday**:
A provider birthday that normalizes to no date: the property is absent, JSON `null`, or `""`.
_Avoid_: undated canonical birth, birthday conflict, malformed provider birthday

**Malformed provider birthday**:
A provider birthday string that is not a full date.
_Avoid_: absent provider birthday

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
How many generations of descendants to include from each sibling of a Bloodline person in Focus mode. Zero means those siblings appear without their children. UI label: **Siblings** (preference key remains `focusCollateralDepth`).
_Avoid_: cousin mode, extended family (vague)

**Family**:
A GEDCOM-style union of up to two parents with children and pedigree types — a stored record, not a graph viewing mode.
_Avoid_: using Family to mean Focus mode or the whole tree

**Lineage**:
The Lineage Anchor, all of their descendants, and the spouses of the anchor and of those descendants.
_Avoid_: Bloodline (includes ancestors), Focus cone (also includes sibling branches), family line

**Lineage Anchor**:
The Person a Lineage is rooted on.
_Avoid_: Focus Anchor (roots a Focus neighborhood, which is a different set of people)

**Lineage Grant**:
A live, read-only view that one account gives another logged-in account of a single Lineage. The people remain the owning account's.
_Avoid_: Focus Share, Guest Session, copy, merge

**Focus Share**:
A named, password-gated public link that exposes a live Focus-mode cone of the owner's tree as a read-only 3D graph (with a read-only person summary) to recipients without accounts.
_Avoid_: public tree, invite link, collaborator share

**Guest Session**:
Short-lived, Focus-Share-scoped read-only access after a correct share password, carried in a dedicated guest cookie separate from the owner's session.
_Avoid_: anonymous user, public session
