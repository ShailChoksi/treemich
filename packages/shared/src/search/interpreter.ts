/**
 * @packageDocumentation
 * Natural-language search interpreter: maps free-text queries to graph traversal intents
 * (`RelationshipType` hop chains) plus optional age filters.
 */

import type { RelationshipType } from "../index.js";

/** High-level relationship query intent produced by {@link RuleBasedInterpreter}. */
export type InterpreterIntent =
  | "FIND_ADOPTED_CHILDREN"
  | "FIND_ADOPTED_SONS"
  | "FIND_ADOPTED_DAUGHTERS"
  | "FIND_CHILDREN"
  | "FIND_SONS"
  | "FIND_DAUGHTERS"
  | "FIND_PARENTS"
  | "FIND_FATHER"
  | "FIND_MOTHER"
  | "FIND_SPOUSE"
  | "FIND_SIBLINGS"
  | "FIND_BROTHERS"
  | "FIND_SISTERS"
  | "FIND_GRANDPARENTS"
  | "FIND_GRANDFATHER"
  | "FIND_GRANDMOTHER"
  | "FIND_GRANDCHILDREN"
  | "FIND_GRANDSON"
  | "FIND_GRANDDAUGHTER"
  | "FIND_UNCLES"
  | "FIND_AUNTS"
  | "FIND_NIECES"
  | "FIND_NEPHEWS"
  | "FIND_COUSINS"
  | "FIND_SECOND_COUSINS"
  | "FIND_PARENTS_IN_LAW"
  | "FIND_FATHER_IN_LAW"
  | "FIND_MOTHER_IN_LAW"
  | "FIND_CHILDREN_IN_LAW"
  | "FIND_SON_IN_LAW"
  | "FIND_DAUGHTER_IN_LAW"
  | "FIND_SIBLINGS_IN_LAW"
  | "FIND_BROTHER_IN_LAW"
  | "FIND_SISTER_IN_LAW"
  | "FIND_GRANDPARENTS_IN_LAW"
  | "FIND_GRANDFATHER_IN_LAW"
  | "FIND_GRANDMOTHER_IN_LAW"
  | "FIND_UNCLES_IN_LAW"
  | "FIND_AUNTS_IN_LAW"
  | "FIND_COUSINS_IN_LAW";

/** Optional numeric age / birth-year constraints parsed from the query tail. */
export type AgeFilter =
  | { kind: "minAge"; years: number }
  | { kind: "maxAge"; years: number }
  | { kind: "ageRange"; min: number; max: number }
  | { kind: "bornAfter"; year: number }
  | { kind: "bornBefore"; year: number }
  | { kind: "bornInYear"; year: number };

/** Successful parse: who to start from, which hops to walk, and optional filters. */
export type ParsedQuery = {
  intent: InterpreterIntent;
  sourceName: string;
  requiredGender?: "MALE" | "FEMALE";
  hops: RelationshipType[];
  ageFilter?: AgeFilter;
};

/** Either a structured parse or a human-readable failure reason. */
export type InterpreterResult =
  | {
      ok: true;
      parsed: ParsedQuery;
    }
  | {
      ok: false;
      reason: string;
    };

/** Pluggable interpreter for people search (shared contract for API and tests). */
export interface QueryInterpreter {
  interpret(query: string): InterpreterResult;
}

const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ");

type MatcherEntry = {
  pattern: RegExp;
  intent: InterpreterIntent;
  hops: RelationshipType[];
  requiredGender?: "MALE" | "FEMALE";
};

const matchers: MatcherEntry[] = [
  // --- adopted children (family pedigree); must appear before generic "children of" ---
  {
    pattern: /^adopted sons? of (.+)$/i,
    intent: "FIND_ADOPTED_SONS",
    hops: ["CHILD_OF"],
    requiredGender: "MALE"
  },
  {
    pattern: /^adopted daughters? of (.+)$/i,
    intent: "FIND_ADOPTED_DAUGHTERS",
    hops: ["CHILD_OF"],
    requiredGender: "FEMALE"
  },
  { pattern: /^adopted children of (.+)$/i, intent: "FIND_ADOPTED_CHILDREN", hops: ["CHILD_OF"] },

  // --- single-hop: children ---
  { pattern: /^sons? of (.+)$/i, intent: "FIND_SONS", hops: ["CHILD_OF"], requiredGender: "MALE" },
  {
    pattern: /^daughters? of (.+)$/i,
    intent: "FIND_DAUGHTERS",
    hops: ["CHILD_OF"],
    requiredGender: "FEMALE"
  },
  { pattern: /^children of (.+)$/i, intent: "FIND_CHILDREN", hops: ["CHILD_OF"] },

  // --- single-hop: parents ---
  { pattern: /^father of (.+)$/i, intent: "FIND_FATHER", hops: ["PARENT_OF"], requiredGender: "MALE" },
  { pattern: /^mother of (.+)$/i, intent: "FIND_MOTHER", hops: ["PARENT_OF"], requiredGender: "FEMALE" },
  { pattern: /^parents? of (.+)$/i, intent: "FIND_PARENTS", hops: ["PARENT_OF"] },

  // --- single-hop: spouse ---
  { pattern: /^spouses? of (.+)$/i, intent: "FIND_SPOUSE", hops: ["SPOUSE_OF"] },

  // --- single-hop: siblings ---
  { pattern: /^brothers? of (.+)$/i, intent: "FIND_BROTHERS", hops: ["SIBLING_OF"], requiredGender: "MALE" },
  { pattern: /^sisters? of (.+)$/i, intent: "FIND_SISTERS", hops: ["SIBLING_OF"], requiredGender: "FEMALE" },
  { pattern: /^siblings? of (.+)$/i, intent: "FIND_SIBLINGS", hops: ["SIBLING_OF"] },

  // --- 2-hop: grandparents ---
  {
    pattern: /^grandfather of (.+)$/i,
    intent: "FIND_GRANDFATHER",
    hops: ["PARENT_OF", "PARENT_OF"],
    requiredGender: "MALE"
  },
  {
    pattern: /^grandmother of (.+)$/i,
    intent: "FIND_GRANDMOTHER",
    hops: ["PARENT_OF", "PARENT_OF"],
    requiredGender: "FEMALE"
  },
  { pattern: /^grandparents? of (.+)$/i, intent: "FIND_GRANDPARENTS", hops: ["PARENT_OF", "PARENT_OF"] },

  // --- 2-hop: grandchildren ---
  {
    pattern: /^grandsons? of (.+)$/i,
    intent: "FIND_GRANDSON",
    hops: ["CHILD_OF", "CHILD_OF"],
    requiredGender: "MALE"
  },
  {
    pattern: /^granddaughters? of (.+)$/i,
    intent: "FIND_GRANDDAUGHTER",
    hops: ["CHILD_OF", "CHILD_OF"],
    requiredGender: "FEMALE"
  },
  { pattern: /^grandchildren of (.+)$/i, intent: "FIND_GRANDCHILDREN", hops: ["CHILD_OF", "CHILD_OF"] },

  // --- 2-hop: uncles/aunts ---
  {
    pattern: /^uncles? of (.+)$/i,
    intent: "FIND_UNCLES",
    hops: ["PARENT_OF", "SIBLING_OF"],
    requiredGender: "MALE"
  },
  {
    pattern: /^aunts? of (.+)$/i,
    intent: "FIND_AUNTS",
    hops: ["PARENT_OF", "SIBLING_OF"],
    requiredGender: "FEMALE"
  },

  // --- 2-hop: nieces/nephews ---
  {
    pattern: /^nieces? of (.+)$/i,
    intent: "FIND_NIECES",
    hops: ["SIBLING_OF", "CHILD_OF"],
    requiredGender: "FEMALE"
  },
  {
    pattern: /^nephews? of (.+)$/i,
    intent: "FIND_NEPHEWS",
    hops: ["SIBLING_OF", "CHILD_OF"],
    requiredGender: "MALE"
  },

  // --- 3-hop: first cousins ---
  {
    pattern: /^(?:first )?cousins? of (.+)$/i,
    intent: "FIND_COUSINS",
    hops: ["PARENT_OF", "SIBLING_OF", "CHILD_OF"]
  },

  // --- 5-hop: second cousins ---
  {
    pattern: /^second cousins? of (.+)$/i,
    intent: "FIND_SECOND_COUSINS",
    hops: ["PARENT_OF", "PARENT_OF", "SIBLING_OF", "CHILD_OF", "CHILD_OF"]
  },

  // --- in-laws ---
  {
    pattern: /^father(?:-|\s)+in(?:-|\s)+law of (.+)$/i,
    intent: "FIND_FATHER_IN_LAW",
    hops: ["SPOUSE_OF", "PARENT_OF"],
    requiredGender: "MALE"
  },
  {
    pattern: /^mother(?:-|\s)+in(?:-|\s)+law of (.+)$/i,
    intent: "FIND_MOTHER_IN_LAW",
    hops: ["SPOUSE_OF", "PARENT_OF"],
    requiredGender: "FEMALE"
  },
  {
    pattern: /^parents?(?:-|\s)+in(?:-|\s)+law of (.+)$/i,
    intent: "FIND_PARENTS_IN_LAW",
    hops: ["SPOUSE_OF", "PARENT_OF"]
  },
  {
    pattern: /^sons?(?:-|\s)+in(?:-|\s)+law of (.+)$/i,
    intent: "FIND_SON_IN_LAW",
    hops: ["CHILD_OF", "SPOUSE_OF"],
    requiredGender: "MALE"
  },
  {
    pattern: /^daughters?(?:-|\s)+in(?:-|\s)+law of (.+)$/i,
    intent: "FIND_DAUGHTER_IN_LAW",
    hops: ["CHILD_OF", "SPOUSE_OF"],
    requiredGender: "FEMALE"
  },
  {
    pattern: /^children(?:-|\s)+in(?:-|\s)+law of (.+)$/i,
    intent: "FIND_CHILDREN_IN_LAW",
    hops: ["CHILD_OF", "SPOUSE_OF"]
  },
  {
    pattern: /^brothers?(?:-|\s)+in(?:-|\s)+law of (.+)$/i,
    intent: "FIND_BROTHER_IN_LAW",
    hops: ["SPOUSE_OF", "SIBLING_OF"],
    requiredGender: "MALE"
  },
  {
    pattern: /^sisters?(?:-|\s)+in(?:-|\s)+law of (.+)$/i,
    intent: "FIND_SISTER_IN_LAW",
    hops: ["SPOUSE_OF", "SIBLING_OF"],
    requiredGender: "FEMALE"
  },
  {
    pattern: /^siblings?(?:-|\s)+in(?:-|\s)+law of (.+)$/i,
    intent: "FIND_SIBLINGS_IN_LAW",
    hops: ["SPOUSE_OF", "SIBLING_OF"]
  },
  {
    pattern: /^grandfather(?:-|\s)+in(?:-|\s)+law of (.+)$/i,
    intent: "FIND_GRANDFATHER_IN_LAW",
    hops: ["SPOUSE_OF", "PARENT_OF", "PARENT_OF"],
    requiredGender: "MALE"
  },
  {
    pattern: /^grandmother(?:-|\s)+in(?:-|\s)+law of (.+)$/i,
    intent: "FIND_GRANDMOTHER_IN_LAW",
    hops: ["SPOUSE_OF", "PARENT_OF", "PARENT_OF"],
    requiredGender: "FEMALE"
  },
  {
    pattern: /^grandparents?(?:-|\s)+in(?:-|\s)+law of (.+)$/i,
    intent: "FIND_GRANDPARENTS_IN_LAW",
    hops: ["SPOUSE_OF", "PARENT_OF", "PARENT_OF"]
  },
  {
    pattern: /^uncles?(?:-|\s)+in(?:-|\s)+law of (.+)$/i,
    intent: "FIND_UNCLES_IN_LAW",
    hops: ["SPOUSE_OF", "PARENT_OF", "SIBLING_OF"],
    requiredGender: "MALE"
  },
  {
    pattern: /^aunts?(?:-|\s)+in(?:-|\s)+law of (.+)$/i,
    intent: "FIND_AUNTS_IN_LAW",
    hops: ["SPOUSE_OF", "PARENT_OF", "SIBLING_OF"],
    requiredGender: "FEMALE"
  },
  {
    pattern: /^cousins?(?:-|\s)+in(?:-|\s)+law of (.+)$/i,
    intent: "FIND_COUSINS_IN_LAW",
    hops: ["SPOUSE_OF", "PARENT_OF", "SIBLING_OF", "CHILD_OF"]
  }
];

const ageSuffixPatterns: Array<{ pattern: RegExp; toFilter: (...args: string[]) => AgeFilter | null }> = [
  {
    pattern: /\s+(?:older than|over)\s+(\d+)$/i,
    toFilter: (years) => ({ kind: "minAge", years: parseInt(years, 10) })
  },
  {
    pattern: /\s+(?:younger than|under)\s+(\d+)$/i,
    toFilter: (years) => ({ kind: "maxAge", years: parseInt(years, 10) })
  },
  {
    pattern: /\s+between\s+(\d+)\s+and\s+(\d+)$/i,
    toFilter: (min, max) => ({ kind: "ageRange", min: parseInt(min, 10), max: parseInt(max, 10) })
  },
  {
    pattern: /\s+born after\s+(\d{4})$/i,
    toFilter: (year) => ({ kind: "bornAfter", year: parseInt(year, 10) })
  },
  {
    pattern: /\s+born before\s+(\d{4})$/i,
    toFilter: (year) => ({ kind: "bornBefore", year: parseInt(year, 10) })
  },
  {
    pattern: /\s+born in\s+(\d{4})$/i,
    toFilter: (year) => ({ kind: "bornInYear", year: parseInt(year, 10) })
  }
];

const genderPrefixPattern = /^(male|female)\s+/i;

/**
 * Rewrites "NAME's relationship" → "relationship of NAME" (also "NAME' relationship" e.g. James' cousins).
 * Implemented without backtracking-prone regex (avoids ReDoS on untrusted query strings).
 */
function rewritePossessive(query: string): string {
  const t = query.trim();
  if (!t) {
    return query;
  }

  const trySplitAt = (apos: number): { owner: string; relation: string } | null => {
    if (apos <= 0 || apos >= t.length - 1 || t[apos] !== "'") {
      return null;
    }
    let after = apos + 1;
    const c = t[after];
    if (c === "s" || c === "S") {
      after += 1;
    }
    while (after < t.length && /\s/.test(t.charAt(after))) {
      after += 1;
    }
    if (after >= t.length) {
      return null;
    }
    const owner = t.slice(0, apos).trim();
    const relation = t.slice(after).trim();
    if (!owner || !relation) {
      return null;
    }
    return { owner, relation };
  };

  // Prefer the last "'s " / "' " that yields a valid split (matches former /^(.+?)'s?\s+(.+)$/ behavior on multi-apostrophe names).
  for (let i = t.length - 2; i >= 1; i -= 1) {
    if (t[i] !== "'") {
      continue;
    }
    const split = trySplitAt(i);
    if (split) {
      return `${split.relation} of ${split.owner}`;
    }
  }

  return query;
}

function stripAgeFilter(query: string): { remaining: string; ageFilter?: AgeFilter } {
  for (const { pattern, toFilter } of ageSuffixPatterns) {
    const match = query.match(pattern);
    if (match) {
      const captures = match.slice(1);
      const filter = toFilter(...captures);
      if (filter) {
        return { remaining: query.slice(0, match.index!).trim(), ageFilter: filter };
      }
    }
  }
  return { remaining: query };
}

function stripGenderPrefix(query: string): { remaining: string; genderOverride?: "MALE" | "FEMALE" } {
  const match = query.match(genderPrefixPattern);
  if (match?.[1]) {
    const gender = match[1].toUpperCase() as "MALE" | "FEMALE";
    return { remaining: query.slice(match[0].length).trim(), genderOverride: gender };
  }
  return { remaining: query };
}

const SUPPORTED_QUERIES = [
  "adopted children/sons/daughters of NAME (when family pedigree is ADOPTED)",
  "son/daughter/children of NAME",
  "father/mother/parents of NAME",
  "brother/sister/siblings of NAME",
  "spouse of NAME",
  "grandfather/grandmother/grandparents of NAME",
  "grandson/granddaughter/grandchildren of NAME",
  "uncle/aunt of NAME",
  "nephew/niece of NAME",
  "cousin/first cousin/second cousin of NAME",
  "mother/father/parents-in-law of NAME",
  "brother/sister/siblings-in-law of NAME",
  "son/daughter/children-in-law of NAME",
  "grandparents-in-law / uncle/aunt-in-law / cousins-in-law of NAME",
  "NAME's uncle/sister/cousins (possessive form)",
  "Prefix with male/female for gender filter",
  "Suffix with age filter: older than N, under N, born in YYYY, etc."
].join(", ");

/**
 * Regex-driven English query interpreter (e.g. `"children of Alice"`, `"male cousins of Bob under 30"`).
 */
export class RuleBasedInterpreter implements QueryInterpreter {
  interpret(query: string): InterpreterResult {
    const normalized = query.trim();
    if (!normalized) {
      return { ok: false, reason: "Query cannot be empty" };
    }

    const { remaining: withoutAge, ageFilter } = stripAgeFilter(normalized);
    const rewritten = rewritePossessive(withoutAge);
    const { remaining: withoutGender, genderOverride } = stripGenderPrefix(rewritten);

    for (const matcher of matchers) {
      const match = withoutGender.match(matcher.pattern);
      if (match?.[1]) {
        const sourceName = normalizeName(match[1]);
        if (!sourceName) {
          return { ok: false, reason: "Person name cannot be empty" };
        }
        return {
          ok: true,
          parsed: {
            intent: matcher.intent,
            sourceName,
            requiredGender: genderOverride ?? matcher.requiredGender,
            hops: matcher.hops,
            ...(ageFilter ? { ageFilter } : {})
          }
        };
      }
    }

    return {
      ok: false,
      reason: `Unsupported query. Try: ${SUPPORTED_QUERIES}`
    };
  }
}
