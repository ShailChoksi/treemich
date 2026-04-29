import { describe, expect, it } from "vitest";
import { isGraphKeyboardSuppressedTarget } from "./useGraphKeyboardNavigation";

describe("isGraphKeyboardSuppressedTarget", () => {
  it("treats SELECT and combobox as suppressed", () => {
    const select = document.createElement("select");
    expect(isGraphKeyboardSuppressedTarget(select)).toBe(true);

    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    expect(isGraphKeyboardSuppressedTarget(listbox)).toBe(true);
  });

  it("returns false for plain div without role", () => {
    const div = document.createElement("div");
    expect(isGraphKeyboardSuppressedTarget(div)).toBe(false);
  });
});
