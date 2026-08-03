import { PersonNotFoundError, type PersonOwnership, type PersonOwnershipDb } from "./ownership.js";

/**
 * In-memory adapter for PersonOwnership. Keyed by userId → set of owned person ids.
 * `with(db)` returns the same store (transactions are a no-op for this adapter).
 */
export class InMemoryPersonOwnership implements PersonOwnership {
  constructor(private readonly ownedByUser: Map<string, Set<string>> = new Map()) {}

  with(_db: PersonOwnershipDb): PersonOwnership {
    void _db;
    return this;
  }

  seed(userId: string, personIds: string[]): void {
    const set = this.ownedByUser.get(userId) ?? new Set<string>();
    for (const id of personIds) {
      set.add(id);
    }
    this.ownedByUser.set(userId, set);
  }

  async assertOwned(userId: string, personId: string): Promise<string> {
    const set = this.ownedByUser.get(userId);
    if (!set?.has(personId)) {
      throw new PersonNotFoundError();
    }
    return personId;
  }
}
