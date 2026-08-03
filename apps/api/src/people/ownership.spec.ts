import { describe, expect, it } from "vitest";
import { InMemoryPersonOwnership } from "./inMemoryPersonOwnership.js";
import { PersonNotFoundError } from "./ownership.js";

describe("InMemoryPersonOwnership", () => {
  it("returns the personId when owned", async () => {
    const ownership = new InMemoryPersonOwnership();
    ownership.seed("user-1", ["pp-1"]);
    await expect(ownership.assertOwned("user-1", "pp-1")).resolves.toBe("pp-1");
  });

  it("rejects when person is missing for the user", async () => {
    const ownership = new InMemoryPersonOwnership();
    ownership.seed("user-1", ["pp-1"]);
    await expect(ownership.assertOwned("user-1", "pp-missing")).rejects.toBeInstanceOf(PersonNotFoundError);
    await expect(ownership.assertOwned("user-2", "pp-1")).rejects.toBeInstanceOf(PersonNotFoundError);
  });

  it("with() returns a working ownership view", async () => {
    const ownership = new InMemoryPersonOwnership();
    ownership.seed("user-1", ["pp-1"]);
    const bound = ownership.with({} as never);
    await expect(bound.assertOwned("user-1", "pp-1")).resolves.toBe("pp-1");
  });
});
