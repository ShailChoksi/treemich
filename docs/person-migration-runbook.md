# Person Migration Operator Runbook

Use this runbook when upgrading an existing Treemich installation from the old Immich-person-as-identity model to the Treemich-owned person model.

## Backup First

Take a PostgreSQL backup before deploying migrations that drop legacy columns:

```bash
docker exec treemich-postgres pg_dump -U postgres -d treemich -Fc -f /tmp/treemich-before-person-migration.dump
docker cp treemich-postgres:/tmp/treemich-before-person-migration.dump ./treemich-before-person-migration.dump
```

Rollback after destructive column drops requires restoring this backup. Do not rely on reverse migrations once columns such as `PersonProfile.immichPersonId`, `ResearchTask.immichPersonId`, `Family.parent*ImmichPersonId`, or `FamilyChild.childImmichPersonId` are removed.

## Preflight Checks

Run these before deploy on the current database.

```sql
-- Core row counts to compare after migration.
select 'PersonProfile' as table_name, count(*) from "PersonProfile"
union all select 'Relationship', count(*) from "Relationship"
union all select 'Family', count(*) from "Family"
union all select 'FamilyChild', count(*) from "FamilyChild"
union all select 'LifeEvent', count(*) from "LifeEvent"
union all select 'PersonName', count(*) from "PersonName"
union all select 'ResearchTask', count(*) from "ResearchTask"
union all select 'CooccurrenceEdge', count(*) from "CooccurrenceEdge";
```

```sql
-- Before legacy columns are dropped, every non-null Immich person id should map to one profile.
select "userId", "immichPersonId", count(*)
from "PersonProfile"
where "immichPersonId" is not null
group by "userId", "immichPersonId"
having count(*) <> 1;
```

```sql
-- After external identities are created, every old Immich profile id should be preserved.
select p."id", p."userId", p."immichPersonId"
from "PersonProfile" p
left join "PersonExternalIdentity" i
  on i."userId" = p."userId"
 and i."personId" = p."id"
 and i."provider" = 'IMMICH'
 and i."providerPersonId" = p."immichPersonId"
where p."immichPersonId" is not null
  and i."id" is null;
```

## Deploy

Deploy the new images or code, then run migrations:

```bash
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

The Docker Compose API container runs this automatically at startup.

## Post-Migration Validation

Run these checks after deploy.

```sql
-- Confirm canonical person rows and external identity preservation.
select count(*) as people from "PersonProfile";
select "provider", count(*) from "PersonExternalIdentity" group by "provider" order by "provider";
select count(*) as thumbnails from "PersonThumbnail";
select count(*) as duplicate_candidates from "PersonDuplicateCandidate";
select count(*) as merge_audits from "PersonMergeAudit";
```

```sql
-- Core references should all point to canonical PersonProfile.id rows.
select count(*) as broken_relationship_refs
from "Relationship" r
left join "PersonProfile" a on a."id" = r."fromPersonId" and a."userId" = r."userId"
left join "PersonProfile" b on b."id" = r."toPersonId" and b."userId" = r."userId"
where a."id" is null or b."id" is null;
```

```sql
select count(*) as broken_family_parent_refs
from "Family" f
left join "PersonProfile" p1 on p1."id" = f."parent1PersonId" and p1."userId" = f."userId"
left join "PersonProfile" p2 on p2."id" = f."parent2PersonId" and p2."userId" = f."userId"
where (f."parent1PersonId" is not null and p1."id" is null)
   or (f."parent2PersonId" is not null and p2."id" is null);
```

```sql
select count(*) as broken_family_child_refs
from "FamilyChild" fc
join "Family" f on f."id" = fc."familyId"
left join "PersonProfile" p on p."id" = fc."childPersonId" and p."userId" = f."userId"
where fc."childPersonId" is not null and p."id" is null;
```

```sql
select count(*) as broken_research_task_refs
from "ResearchTask" rt
left join "PersonProfile" p on p."id" = rt."personId" and p."userId" = rt."userId"
where rt."personId" is not null and p."id" is null;
```

```sql
select count(*) as broken_cooccurrence_refs
from "CooccurrenceEdge" e
left join "PersonProfile" a on a."id" = e."personAId" and a."userId" = e."userId"
left join "PersonProfile" b on b."id" = e."personBId" and b."userId" = e."userId"
where a."id" is null or b."id" is null;
```

```sql
select count(*) as broken_duplicate_candidate_refs
from "PersonDuplicateCandidate" c
left join "PersonProfile" a on a."id" = c."personAId" and a."userId" = c."userId"
left join "PersonProfile" b on b."id" = c."personBId" and b."userId" = c."userId"
where a."id" is null or b."id" is null;
```

```sql
select count(*) as broken_merge_audit_canonical_refs
from "PersonMergeAudit" a
left join "PersonProfile" p on p."id" = a."canonicalPersonId" and p."userId" = a."userId"
where p."id" is null;
```

Expected result for all `broken_*` checks is `0`.

## Smoke Tests

Verify these user-facing paths:

- Sign in with Treemich email/password on a fresh or existing install.
- If an upgraded database has more than one `TreemichUser` row for the same normalized email, verify password login opens the populated account, not an empty duplicate. The password-login tiebreaker is: matching password hash first, then most `PersonProfile` rows, then newest `updatedAt`, then lowest id.
- Create a standalone person without linking Immich.
- Create/edit a parent-child or spouse relationship.
- Create two likely duplicate people, recompute duplicate candidates from the Duplicates workspace, dismiss/reopen a candidate, then merge into the intended canonical person and verify the duplicate profile disappears.
- Export account data with `GET /api/export/account?format=zip` and confirm `account.json`, `manifest.json`, and any available `thumbnails/...` files exist.
- Export GEDCOM and parse it with a GEDCOM reader or re-import preview.
- If Immich is configured, link Immich, load provider preview, import one thumbnail, then unlink Immich. Imported thumbnail/co-occurrence data should remain visible, but refresh/import should stop until relinked.

## Rollback Limits

If validation fails before destructive migrations have dropped old columns, stop and fix forward if possible. After old columns are dropped, rollback means restoring the PostgreSQL backup taken before deploy and redeploying the previous application version.

Do not try to reconstruct old Immich-id columns from partial exports unless you have verified `PersonExternalIdentity` coverage and relationship/family mappings manually.
