import type { RelationshipType } from "../index.js";

export type InterpreterIntent =
  | "FIND_CHILDREN"
  | "FIND_SONS"
  | "FIND_DAUGHTERS"
  | "FIND_PARENTS"
  | "FIND_SPOUSE";

export type ParsedQuery = {
  intent: InterpreterIntent;
  sourceName: string;
  requiredGender?: "MALE" | "FEMALE";
  relationshipType: RelationshipType;
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

const matchers = [
  {
    pattern: /^son of (.+)$/i,
    toResult: (sourceName: string): InterpreterResult => ({
      ok: true,
      parsed: {
        intent: "FIND_SONS",
        sourceName,
        requiredGender: "MALE",
        relationshipType: "CHILD_OF"
      }
    })
  },
  {
    pattern: /^daughter of (.+)$/i,
    toResult: (sourceName: string): InterpreterResult => ({
      ok: true,
      parsed: {
        intent: "FIND_DAUGHTERS",
        sourceName,
        requiredGender: "FEMALE",
        relationshipType: "CHILD_OF"
      }
    })
  },
  {
    pattern: /^children of (.+)$/i,
    toResult: (sourceName: string): InterpreterResult => ({
      ok: true,
      parsed: {
        intent: "FIND_CHILDREN",
        sourceName,
        relationshipType: "CHILD_OF"
      }
    })
  },
  {
    pattern: /^parents of (.+)$/i,
    toResult: (sourceName: string): InterpreterResult => ({
      ok: true,
      parsed: {
        intent: "FIND_PARENTS",
        sourceName,
        relationshipType: "PARENT_OF"
      }
    })
  },
  {
    pattern: /^spouse of (.+)$/i,
    toResult: (sourceName: string): InterpreterResult => ({
      ok: true,
      parsed: {
        intent: "FIND_SPOUSE",
        sourceName,
        relationshipType: "SPOUSE_OF"
      }
    })
  }
] as const;

export class RuleBasedInterpreter implements QueryInterpreter {
  interpret(query: string): InterpreterResult {
    const normalized = query.trim();
    if (!normalized) {
      return { ok: false, reason: "Query cannot be empty" };
    }

    for (const matcher of matchers) {
      const match = normalized.match(matcher.pattern);
      if (match?.[1]) {
        return matcher.toResult(normalizeName(match[1]));
      }
    }

    return {
      ok: false,
      reason:
        "Unsupported query. Try: son of NAME, daughter of NAME, children of NAME, parents of NAME, spouse of NAME"
    };
  }
}
