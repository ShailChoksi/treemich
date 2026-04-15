import { describe, expect, it } from "vitest";
import { RuleBasedInterpreter } from "./ruleBasedInterpreter.js";

describe("RuleBasedInterpreter", () => {
  const interpreter = new RuleBasedInterpreter();

  // --- existing single-hop: children ---

  it("parses son query", () => {
    const result = interpreter.interpret("son of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_SONS");
    expect(result.parsed.requiredGender).toBe("MALE");
    expect(result.parsed.sourceName).toBe("Mike");
    expect(result.parsed.hops).toEqual(["CHILD_OF"]);
  });

  it("parses sons (plural) query", () => {
    const result = interpreter.interpret("sons of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_SONS");
    expect(result.parsed.hops).toEqual(["CHILD_OF"]);
  });

  it("parses daughter query", () => {
    const result = interpreter.interpret("daughter of Lisa");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_DAUGHTERS");
    expect(result.parsed.requiredGender).toBe("FEMALE");
    expect(result.parsed.hops).toEqual(["CHILD_OF"]);
  });

  it("parses children query", () => {
    const result = interpreter.interpret("children of Maria");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_CHILDREN");
    expect(result.parsed.hops).toEqual(["CHILD_OF"]);
    expect(result.parsed.requiredGender).toBeUndefined();
  });

  // --- single-hop: parents ---

  it("parses parents query", () => {
    const result = interpreter.interpret("parents of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_PARENTS");
    expect(result.parsed.hops).toEqual(["PARENT_OF"]);
  });

  it("parses parent (singular) query", () => {
    const result = interpreter.interpret("parent of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_PARENTS");
    expect(result.parsed.hops).toEqual(["PARENT_OF"]);
  });

  it("parses father query", () => {
    const result = interpreter.interpret("father of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_FATHER");
    expect(result.parsed.requiredGender).toBe("MALE");
    expect(result.parsed.hops).toEqual(["PARENT_OF"]);
  });

  it("parses mother query", () => {
    const result = interpreter.interpret("mother of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_MOTHER");
    expect(result.parsed.requiredGender).toBe("FEMALE");
    expect(result.parsed.hops).toEqual(["PARENT_OF"]);
  });

  // --- single-hop: spouse ---

  it("parses spouse query", () => {
    const result = interpreter.interpret("spouse of Anna");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_SPOUSE");
    expect(result.parsed.hops).toEqual(["SPOUSE_OF"]);
  });

  // --- single-hop: siblings ---

  it("parses siblings query", () => {
    const result = interpreter.interpret("siblings of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_SIBLINGS");
    expect(result.parsed.hops).toEqual(["SIBLING_OF"]);
    expect(result.parsed.requiredGender).toBeUndefined();
  });

  it("parses sibling (singular) query", () => {
    const result = interpreter.interpret("sibling of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_SIBLINGS");
    expect(result.parsed.hops).toEqual(["SIBLING_OF"]);
  });

  it("parses brothers query", () => {
    const result = interpreter.interpret("brothers of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_BROTHERS");
    expect(result.parsed.requiredGender).toBe("MALE");
    expect(result.parsed.hops).toEqual(["SIBLING_OF"]);
  });

  it("parses brother (singular) query", () => {
    const result = interpreter.interpret("brother of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_BROTHERS");
    expect(result.parsed.hops).toEqual(["SIBLING_OF"]);
  });

  it("parses sisters query", () => {
    const result = interpreter.interpret("sisters of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_SISTERS");
    expect(result.parsed.requiredGender).toBe("FEMALE");
    expect(result.parsed.hops).toEqual(["SIBLING_OF"]);
  });

  it("parses sister (singular) query", () => {
    const result = interpreter.interpret("sister of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_SISTERS");
    expect(result.parsed.hops).toEqual(["SIBLING_OF"]);
  });

  // --- 2-hop: grandparents ---

  it("parses grandparents query", () => {
    const result = interpreter.interpret("grandparents of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_GRANDPARENTS");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "PARENT_OF"]);
    expect(result.parsed.requiredGender).toBeUndefined();
  });

  it("parses grandparent (singular) query", () => {
    const result = interpreter.interpret("grandparent of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_GRANDPARENTS");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "PARENT_OF"]);
  });

  it("parses grandfather query", () => {
    const result = interpreter.interpret("grandfather of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_GRANDFATHER");
    expect(result.parsed.requiredGender).toBe("MALE");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "PARENT_OF"]);
  });

  it("parses grandmother query", () => {
    const result = interpreter.interpret("grandmother of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_GRANDMOTHER");
    expect(result.parsed.requiredGender).toBe("FEMALE");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "PARENT_OF"]);
  });

  // --- 2-hop: grandchildren ---

  it("parses grandchildren query", () => {
    const result = interpreter.interpret("grandchildren of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_GRANDCHILDREN");
    expect(result.parsed.hops).toEqual(["CHILD_OF", "CHILD_OF"]);
    expect(result.parsed.requiredGender).toBeUndefined();
  });

  it("parses grandson query", () => {
    const result = interpreter.interpret("grandson of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_GRANDSON");
    expect(result.parsed.requiredGender).toBe("MALE");
    expect(result.parsed.hops).toEqual(["CHILD_OF", "CHILD_OF"]);
  });

  it("parses grandsons (plural) query", () => {
    const result = interpreter.interpret("grandsons of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_GRANDSON");
    expect(result.parsed.hops).toEqual(["CHILD_OF", "CHILD_OF"]);
  });

  it("parses granddaughter query", () => {
    const result = interpreter.interpret("granddaughter of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_GRANDDAUGHTER");
    expect(result.parsed.requiredGender).toBe("FEMALE");
    expect(result.parsed.hops).toEqual(["CHILD_OF", "CHILD_OF"]);
  });

  it("parses granddaughters (plural) query", () => {
    const result = interpreter.interpret("granddaughters of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_GRANDDAUGHTER");
    expect(result.parsed.hops).toEqual(["CHILD_OF", "CHILD_OF"]);
  });

  // --- 2-hop: uncles/aunts ---

  it("parses uncles query", () => {
    const result = interpreter.interpret("uncles of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_UNCLES");
    expect(result.parsed.requiredGender).toBe("MALE");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "SIBLING_OF"]);
  });

  it("parses uncle (singular) query", () => {
    const result = interpreter.interpret("uncle of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_UNCLES");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "SIBLING_OF"]);
  });

  it("parses aunts query", () => {
    const result = interpreter.interpret("aunts of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_AUNTS");
    expect(result.parsed.requiredGender).toBe("FEMALE");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "SIBLING_OF"]);
  });

  it("parses aunt (singular) query", () => {
    const result = interpreter.interpret("aunt of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_AUNTS");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "SIBLING_OF"]);
  });

  // --- 2-hop: nieces/nephews ---

  it("parses nieces query", () => {
    const result = interpreter.interpret("nieces of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_NIECES");
    expect(result.parsed.requiredGender).toBe("FEMALE");
    expect(result.parsed.hops).toEqual(["SIBLING_OF", "CHILD_OF"]);
  });

  it("parses niece (singular) query", () => {
    const result = interpreter.interpret("niece of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_NIECES");
    expect(result.parsed.hops).toEqual(["SIBLING_OF", "CHILD_OF"]);
  });

  it("parses nephews query", () => {
    const result = interpreter.interpret("nephews of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_NEPHEWS");
    expect(result.parsed.requiredGender).toBe("MALE");
    expect(result.parsed.hops).toEqual(["SIBLING_OF", "CHILD_OF"]);
  });

  it("parses nephew (singular) query", () => {
    const result = interpreter.interpret("nephew of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_NEPHEWS");
    expect(result.parsed.hops).toEqual(["SIBLING_OF", "CHILD_OF"]);
  });

  // --- 3-hop: first cousins ---

  it("parses cousins query", () => {
    const result = interpreter.interpret("cousins of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_COUSINS");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "SIBLING_OF", "CHILD_OF"]);
    expect(result.parsed.requiredGender).toBeUndefined();
  });

  it("parses cousin (singular) query", () => {
    const result = interpreter.interpret("cousin of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_COUSINS");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "SIBLING_OF", "CHILD_OF"]);
  });

  it("parses first cousins query", () => {
    const result = interpreter.interpret("first cousins of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_COUSINS");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "SIBLING_OF", "CHILD_OF"]);
  });

  it("parses first cousin (singular) query", () => {
    const result = interpreter.interpret("first cousin of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_COUSINS");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "SIBLING_OF", "CHILD_OF"]);
  });

  // --- 5-hop: second cousins ---

  it("parses second cousins query", () => {
    const result = interpreter.interpret("second cousins of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_SECOND_COUSINS");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "PARENT_OF", "SIBLING_OF", "CHILD_OF", "CHILD_OF"]);
    expect(result.parsed.requiredGender).toBeUndefined();
  });

  it("parses second cousin (singular) query", () => {
    const result = interpreter.interpret("second cousin of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_SECOND_COUSINS");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "PARENT_OF", "SIBLING_OF", "CHILD_OF", "CHILD_OF"]);
  });

  // --- generic gender prefix ---

  it("parses female cousins via gender prefix", () => {
    const result = interpreter.interpret("female cousins of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_COUSINS");
    expect(result.parsed.requiredGender).toBe("FEMALE");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "SIBLING_OF", "CHILD_OF"]);
  });

  it("parses male grandchildren via gender prefix", () => {
    const result = interpreter.interpret("male grandchildren of Sue");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_GRANDCHILDREN");
    expect(result.parsed.requiredGender).toBe("MALE");
    expect(result.parsed.hops).toEqual(["CHILD_OF", "CHILD_OF"]);
  });

  it("parses female second cousins via gender prefix", () => {
    const result = interpreter.interpret("female second cousins of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_SECOND_COUSINS");
    expect(result.parsed.requiredGender).toBe("FEMALE");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "PARENT_OF", "SIBLING_OF", "CHILD_OF", "CHILD_OF"]);
  });

  it("parses male siblings via gender prefix", () => {
    const result = interpreter.interpret("male siblings of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_SIBLINGS");
    expect(result.parsed.requiredGender).toBe("MALE");
    expect(result.parsed.hops).toEqual(["SIBLING_OF"]);
  });

  it("gender prefix overrides inherent gender on gendered terms", () => {
    const result = interpreter.interpret("male aunts of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.requiredGender).toBe("MALE");
  });

  // --- age/birthday suffix ---

  it("parses 'older than' age filter", () => {
    const result = interpreter.interpret("cousins of Mike older than 20");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.hops).toEqual(["PARENT_OF", "SIBLING_OF", "CHILD_OF"]);
    expect(result.parsed.ageFilter).toEqual({ kind: "minAge", years: 20 });
    expect(result.parsed.sourceName).toBe("Mike");
  });

  it("parses 'younger than' age filter", () => {
    const result = interpreter.interpret("cousins of Mike younger than 30");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.ageFilter).toEqual({ kind: "maxAge", years: 30 });
  });

  it("parses 'over' age filter", () => {
    const result = interpreter.interpret("sisters of Mike over 25");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_SISTERS");
    expect(result.parsed.ageFilter).toEqual({ kind: "minAge", years: 25 });
  });

  it("parses 'under' age filter", () => {
    const result = interpreter.interpret("sisters of Mike under 18");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.ageFilter).toEqual({ kind: "maxAge", years: 18 });
  });

  it("parses 'between N and M' age filter", () => {
    const result = interpreter.interpret("uncles of Mike between 40 and 60");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.ageFilter).toEqual({ kind: "ageRange", min: 40, max: 60 });
  });

  it("parses 'born after' filter", () => {
    const result = interpreter.interpret("aunts of Mike born after 1980");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.ageFilter).toEqual({ kind: "bornAfter", year: 1980 });
  });

  it("parses 'born before' filter", () => {
    const result = interpreter.interpret("aunts of Mike born before 1990");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.ageFilter).toEqual({ kind: "bornBefore", year: 1990 });
  });

  it("parses 'born in' filter", () => {
    const result = interpreter.interpret("aunts of Mike born in 2005");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.ageFilter).toEqual({ kind: "bornInYear", year: 2005 });
  });

  // --- combined gender prefix + age suffix ---

  it("parses gender prefix combined with age suffix", () => {
    const result = interpreter.interpret("female second cousins of Mike older than 20");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_SECOND_COUSINS");
    expect(result.parsed.requiredGender).toBe("FEMALE");
    expect(result.parsed.ageFilter).toEqual({ kind: "minAge", years: 20 });
    expect(result.parsed.hops).toEqual(["PARENT_OF", "PARENT_OF", "SIBLING_OF", "CHILD_OF", "CHILD_OF"]);
  });

  // --- case insensitivity ---

  it("handles case-insensitive queries", () => {
    const result = interpreter.interpret("Sisters Of MIKE");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_SISTERS");
    expect(result.parsed.sourceName).toBe("MIKE");
  });

  it("handles uppercase relationship queries", () => {
    const result = interpreter.interpret("COUSINS OF mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_COUSINS");
    expect(result.parsed.sourceName).toBe("mike");
  });

  // --- multi-word names ---

  it("parses multi-word names", () => {
    const result = interpreter.interpret("sisters of Mary Jane");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.sourceName).toBe("Mary Jane");
  });

  it("parses three-word names", () => {
    const result = interpreter.interpret("uncle of John Paul Smith");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.sourceName).toBe("John Paul Smith");
  });

  // --- no age filter when not provided ---

  it("omits ageFilter when no suffix is given", () => {
    const result = interpreter.interpret("brothers of Mike");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.ageFilter).toBeUndefined();
  });

  // --- possessive form ---

  it("parses possessive form: Mike's uncle", () => {
    const result = interpreter.interpret("Mike's uncle");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_UNCLES");
    expect(result.parsed.sourceName).toBe("Mike");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "SIBLING_OF"]);
  });

  it("parses possessive form: Person A's Uncle", () => {
    const result = interpreter.interpret("Person A's Uncle");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_UNCLES");
    expect(result.parsed.sourceName).toBe("Person A");
    expect(result.parsed.hops).toEqual(["PARENT_OF", "SIBLING_OF"]);
  });

  it("parses possessive form: Sarah's sisters", () => {
    const result = interpreter.interpret("Sarah's sisters");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_SISTERS");
    expect(result.parsed.sourceName).toBe("Sarah");
    expect(result.parsed.requiredGender).toBe("FEMALE");
  });

  it("parses possessive form: James' cousins", () => {
    const result = interpreter.interpret("James' cousins");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_COUSINS");
    expect(result.parsed.sourceName).toBe("James");
  });

  it("parses possessive form with age filter: Mike's cousins older than 20", () => {
    const result = interpreter.interpret("Mike's cousins older than 20");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_COUSINS");
    expect(result.parsed.sourceName).toBe("Mike");
    expect(result.parsed.ageFilter).toEqual({ kind: "minAge", years: 20 });
  });

  it("parses possessive form: Mary Jane's grandchildren", () => {
    const result = interpreter.interpret("Mary Jane's grandchildren");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.intent).toBe("FIND_GRANDCHILDREN");
    expect(result.parsed.sourceName).toBe("Mary Jane");
  });

  // --- error / rejection cases ---

  it("rejects empty query", () => {
    const result = interpreter.interpret("");
    expect(result.ok).toBe(false);
  });

  it("rejects whitespace-only query", () => {
    const result = interpreter.interpret("   ");
    expect(result.ok).toBe(false);
  });

  it("rejects unknown relationship type", () => {
    const result = interpreter.interpret("friends of Mike");
    expect(result.ok).toBe(false);
  });

  it("rejects unsupported cousin depth", () => {
    const result = interpreter.interpret("third cousins of Mike");
    expect(result.ok).toBe(false);
  });
});
