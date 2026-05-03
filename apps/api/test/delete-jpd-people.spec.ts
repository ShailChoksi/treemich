import { describe, expect, it } from "vitest";
import {
  assertJpdAccount,
  JPD_ACCOUNT_GUARD,
  parseDeleteJpdPeopleArgs
} from "../scripts/delete-jpd-people.js";

describe("delete-jpd-people script guards", () => {
  it("parses dry-run mode", () => {
    expect(parseDeleteJpdPeopleArgs(["--dry-run"])).toEqual({ dryRun: true });
    expect(parseDeleteJpdPeopleArgs([])).toEqual({ dryRun: false });
  });

  it("accepts only the configured JPD account", () => {
    expect(() => assertJpdAccount(JPD_ACCOUNT_GUARD)).not.toThrow();
    expect(() => assertJpdAccount({ ...JPD_ACCOUNT_GUARD, email: "someone@example.com" })).toThrow(
      "JPD account guard failed"
    );
  });
});
