import type { RelationshipType } from "../index.js";

export type InterpreterIntent =
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
  | "FIND_SECOND_COUSINS";

export type AgeFilter =
  | { kind: "minAge"; years: number }
  | { kind: "maxAge"; years: number }
  | { kind: "ageRange"; min: number; max: number }
  | { kind: "bornAfter"; year: number }
  | { kind: "bornBefore"; year: number }
  | { kind: "bornInYear"; year: number };

export type ParsedQuery = {
  intent: InterpreterIntent;
  sourceName: string;
  requiredGender?: "MALE" | "FEMALE";
  hops: RelationshipType[];
  ageFilter?: AgeFilter;
};

export type InterpreterResult =
  | {
      ok: true;
      parsed: ParsedQuery;
    }
  | {
      ok: false;
      reason: string;
    };

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
  "son/daughter/children of NAME",
  "father/mother/parents of NAME",
  "brother/sister/siblings of NAME",
  "spouse of NAME",
  "grandfather/grandmother/grandparents of NAME",
  "grandson/granddaughter/grandchildren of NAME",
  "uncle/aunt of NAME",
  "nephew/niece of NAME",
  "cousin/first cousin/second cousin of NAME",
  "Prefix with male/female for gender filter",
  "Suffix with age filter: older than N, under N, born in YYYY, etc."
].join(", ");

export class RuleBasedInterpreter implements QueryInterpreter {
  interpret(query: string): InterpreterResult {
    const normalized = query.trim();
    if (!normalized) {
      return { ok: false, reason: "Query cannot be empty" };
    }

    const { remaining: withoutAge, ageFilter } = stripAgeFilter(normalized);
    const { remaining: withoutGender, genderOverride } = stripGenderPrefix(withoutAge);

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
