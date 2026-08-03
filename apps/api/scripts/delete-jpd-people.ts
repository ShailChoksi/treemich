/**
 * Clear all person graph data from the local JPD test account.
 *
 * From repo root (`DATABASE_URL` in `.env`):
 *   npm run jpd:clear-people --workspace @treemich/api
 *   npm run jpd:clear-people --workspace @treemich/api -- --dry-run
 */

import { PrismaClient, type TreemichUser } from "@prisma/client";
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../../../.env") });

export const JPD_ACCOUNT_GUARD = {
  id: "cmon1hxrc0000mw3m1nkfllqo",
  email: "jessicashail@proton.me",
  name: "JPD"
} as const;

export type DeleteJpdPeopleOptions = {
  dryRun: boolean;
};

export type JpdPeopleCounts = {
  people: number;
  relationships: number;
  families: number;
  familyChildren: number;
  lifeEvents: number;
  personExternalIdentities: number;
  personThumbnails: number;
  cooccurrenceEdges: number;
  mediaLinksToPeople: number;
  duplicateCandidates: number;
  mergeAudits: number;
  validationFindings: number;
};

type GuardedJpdUser = {
  id: string;
  email: string;
  name: string;
};

export type DeleteJpdPeopleResult = {
  user: GuardedJpdUser;
  before: JpdPeopleCounts;
  deleted: Omit<JpdPeopleCounts, "familyChildren" | "personExternalIdentities" | "personThumbnails">;
  after: JpdPeopleCounts;
};

export const parseDeleteJpdPeopleArgs = (argv: string[]): DeleteJpdPeopleOptions => ({
  dryRun: argv.includes("--dry-run")
});

export const assertJpdAccount = (
  user: Pick<TreemichUser, "id" | "email" | "name"> | null
): GuardedJpdUser => {
  if (
    !user ||
    user.id !== JPD_ACCOUNT_GUARD.id ||
    user.email !== JPD_ACCOUNT_GUARD.email ||
    user.name !== JPD_ACCOUNT_GUARD.name
  ) {
    throw new Error("JPD account guard failed; refusing to delete person data.");
  }
  return user as GuardedJpdUser;
};

type PrismaLikeClient = PrismaClient;

const getJpdUser = async (prisma: PrismaLikeClient) => {
  const user = await prisma.treemichUser.findUnique({
    where: { id: JPD_ACCOUNT_GUARD.id },
    select: { id: true, email: true, name: true }
  });
  return assertJpdAccount(user);
};

const getJpdPersonIds = async (prisma: PrismaLikeClient) =>
  (
    await prisma.personProfile.findMany({
      where: { userId: JPD_ACCOUNT_GUARD.id },
      select: { id: true }
    })
  ).map((person) => person.id);

const countJpdPeopleData = async (prisma: PrismaLikeClient): Promise<JpdPeopleCounts> => {
  const personIds = await getJpdPersonIds(prisma);
  return {
    people: personIds.length,
    relationships: await prisma.relationship.count({ where: { userId: JPD_ACCOUNT_GUARD.id } }),
    families: await prisma.family.count({ where: { userId: JPD_ACCOUNT_GUARD.id } }),
    familyChildren: await prisma.familyChild.count({ where: { family: { userId: JPD_ACCOUNT_GUARD.id } } }),
    lifeEvents: await prisma.lifeEvent.count({ where: { userId: JPD_ACCOUNT_GUARD.id } }),
    personExternalIdentities: await prisma.personExternalIdentity.count({
      where: { userId: JPD_ACCOUNT_GUARD.id }
    }),
    personThumbnails: await prisma.personThumbnail.count({ where: { userId: JPD_ACCOUNT_GUARD.id } }),
    cooccurrenceEdges: await prisma.cooccurrenceEdge.count({ where: { userId: JPD_ACCOUNT_GUARD.id } }),
    mediaLinksToPeople:
      personIds.length > 0
        ? await prisma.mediaLink.count({
            where: {
              userId: JPD_ACCOUNT_GUARD.id,
              targetType: "PERSON_PROFILE",
              targetId: { in: personIds }
            }
          })
        : 0,
    duplicateCandidates: await prisma.personDuplicateCandidate.count({
      where: { userId: JPD_ACCOUNT_GUARD.id }
    }),
    mergeAudits: await prisma.personMergeAudit.count({ where: { userId: JPD_ACCOUNT_GUARD.id } }),
    validationFindings: await prisma.validationFinding.count({ where: { userId: JPD_ACCOUNT_GUARD.id } })
  };
};

export const deleteJpdPeopleData = async (
  prisma: PrismaLikeClient,
  options: DeleteJpdPeopleOptions
): Promise<DeleteJpdPeopleResult> => {
  const user = await getJpdUser(prisma);
  const before = await countJpdPeopleData(prisma);
  if (options.dryRun) {
    return {
      user,
      before,
      deleted: {
        people: 0,
        relationships: 0,
        families: 0,
        lifeEvents: 0,
        cooccurrenceEdges: 0,
        mediaLinksToPeople: 0,
        duplicateCandidates: 0,
        mergeAudits: 0,
        validationFindings: 0
      },
      after: before
    };
  }

  const personIds = await getJpdPersonIds(prisma);
  const deleted = await prisma.$transaction(async (tx) => {
    const mediaLinksToPeople =
      personIds.length > 0
        ? await tx.mediaLink.deleteMany({
            where: {
              userId: JPD_ACCOUNT_GUARD.id,
              targetType: "PERSON_PROFILE",
              targetId: { in: personIds }
            }
          })
        : { count: 0 };
    const mergeAudits = await tx.personMergeAudit.deleteMany({ where: { userId: JPD_ACCOUNT_GUARD.id } });
    const duplicateCandidates = await tx.personDuplicateCandidate.deleteMany({
      where: { userId: JPD_ACCOUNT_GUARD.id }
    });
    const validationFindings = await tx.validationFinding.deleteMany({
      where: { userId: JPD_ACCOUNT_GUARD.id }
    });
    const cooccurrenceEdges = await tx.cooccurrenceEdge.deleteMany({
      where: { userId: JPD_ACCOUNT_GUARD.id }
    });
    const lifeEvents = await tx.lifeEvent.deleteMany({ where: { userId: JPD_ACCOUNT_GUARD.id } });
    const relationships = await tx.relationship.deleteMany({ where: { userId: JPD_ACCOUNT_GUARD.id } });
    const families = await tx.family.deleteMany({ where: { userId: JPD_ACCOUNT_GUARD.id } });
    const people = await tx.personProfile.deleteMany({ where: { userId: JPD_ACCOUNT_GUARD.id } });

    return {
      people: people.count,
      relationships: relationships.count,
      families: families.count,
      lifeEvents: lifeEvents.count,
      cooccurrenceEdges: cooccurrenceEdges.count,
      mediaLinksToPeople: mediaLinksToPeople.count,
      duplicateCandidates: duplicateCandidates.count,
      mergeAudits: mergeAudits.count,
      validationFindings: validationFindings.count
    };
  });
  const after = await countJpdPeopleData(prisma);
  return { user, before, deleted, after };
};

const main = async () => {
  const options = parseDeleteJpdPeopleArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const result = await deleteJpdPeopleData(prisma, options);
    console.log(JSON.stringify({ mode: options.dryRun ? "dry-run" : "delete", ...result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
