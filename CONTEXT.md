# Domain Glossary

## Person identity

The canonical identifier for a person in Treemich. Represented by `PersonProfile.id` and exposed through APIs as `personId`. Core genealogy Modules (life events, relationships, names, families, research tasks) resolve and store only this canonical id.

**Provider identity** is a separate, optional concept — an external identifier stored in `PersonExternalIdentity.providerPersonId` used solely by import/provider Adapter paths (GEDCOM import, Immich linking) for translation into canonical person identity before invoking core genealogy Modules.

**ProfileResolver** is the Adapter at the identity Seam: it resolves a user-scoped `personId` to the canonical `PersonProfile.id` or rejects it. Core genealogy Modules inject the ProfileResolver rather than performing provider-id fallback themselves.
