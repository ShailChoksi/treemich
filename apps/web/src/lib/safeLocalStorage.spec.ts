import { afterEach, describe, expect, it, vi } from "vitest";
import { getLocalStorageItem, setLocalStorageItem } from "./safeLocalStorage";

describe("safeLocalStorage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getLocalStorageItem returns null when getItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(getLocalStorageItem("k")).toBeNull();
    spy.mockRestore();
  });

  it("setLocalStorageItem returns false when setItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(setLocalStorageItem("k", "v")).toBe(false);
    spy.mockRestore();
  });
});
