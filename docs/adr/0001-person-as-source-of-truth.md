# ADR 0001: Treemich Person as Source of Truth

## Status

Accepted

## Context

Treemich originally used Immich people as the identity source for genealogy records. Local rows such as profiles, relationships, families, names, life events, research tasks, and GEDCOM matches used Immich person ids directly. That made Immich availability and Immich person creation a blocker for standalone genealogy workflows.

## Decision

Treemich owns person identity. The canonical person id is the Treemich `PersonProfile.id` row, exposed through APIs as `personId`. Immich identities are optional external identities linked to a Treemich person for imports, thumbnails, photo metadata, and provenance only.

`PersonProfile` remains the internal Prisma model name for now. This is accepted implementation naming debt: `PersonProfile.id` is the canonical person row/id, and public API/export language should say person/people. A schema rename to `Person` is deferred until the current export, documentation, and compatibility cleanup is complete and only if the remaining name causes practical development confusion.

`immichPersonId` may still appear in provider-specific APIs, compatibility responses, and migration code. It must not be used as the source-of-truth key for new genealogy relationships, family membership, life events, research tasks, GEDCOM matching, or UI selection.

Account export v2 is the default export shape and uses `people`, `personExternalIdentities`, and `personThumbnails`. Export v1 with the legacy `personProfiles` collection name is retained for older tooling, but new integrations should use v2.

GEDCOM export emits canonical `_TREEMICH_PERSON_ID` tags by default. GEDCOM import continues to accept legacy `_TREEMICH_IMMICH_PERSON_ID` and `_IMMICH` tags as provider hints for older files, but those tags are not source-of-truth identifiers and should not be emitted by default.

Thumbnail precedence is:

1. Treemich-owned thumbnail metadata.
2. Imported Immich thumbnail metadata for a linked external identity.
3. Generated placeholder or initials avatar.

Imported Immich thumbnails are copied into Treemich-owned thumbnail storage. Unlinking Immich stops future refreshes, but does not delete thumbnails already imported into Treemich.

Photo co-occurrence edges imported from Immich are treated as imported evidence/suggestions. They persist after unlinking Immich with `sourceProvider` / `sourceImportedAt` provenance metadata, but refresh/import jobs require relinking an Immich account. Aggregate source metadata is sufficient for this migration; per-asset provenance can be added later if evidence workflows require it.

Authentication is Treemich-owned. Immich login may remain as a link or migration path, but a user must be able to use core genealogy features without a linked Immich account.

## Consequences

- Existing Immich ids are preserved in `PersonExternalIdentity` rows during migration.
- Core tables reference Treemich person ids.
- GEDCOM import can create Treemich people directly.
- Immich-backed photo features become optional provider features and must degrade gracefully when unlinked or unavailable; copied thumbnails and imported co-occurrence suggestions remain Treemich data.
- Compatibility aliases may exist during a migration window, but new code should use neutral person terminology.
