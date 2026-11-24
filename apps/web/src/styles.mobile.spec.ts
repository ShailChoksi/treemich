/**
 * Regression guard for the narrow-screen layout. Happy DOM does not apply media queries or layout, so these
 * tests assert on the stylesheet itself: each rule below fixes an overlap or overflow seen on phones.
 */
import { describe, expect, it } from "vitest";

// Read from disk: Vitest replaces `.css` imports (including `?raw`) with an empty module by default.
// `node:fs` is loaded untyped so this spec does not pull Node globals into the browser app's type-check.
type NodeFs = { readFileSync: (path: URL, encoding: "utf8") => string };
const nodeFsModuleId = "node:fs";
const { readFileSync } = (await import(/* @vite-ignore */ nodeFsModuleId)) as NodeFs;
const readSource = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const css = readSource("./styles.css");
const focusLockBadgeSource = readSource("./components/graph/FocusLockBadge.tsx");
const nodeActionButtonsSource = readSource("./components/graph/NodeActionButtons.tsx");

/** Splits the stylesheet into `@media` block bodies (by query) and everything outside them. */
const splitMediaBlocks = (source: string) => {
  const blocksByQuery = new Map<string, string[]>();
  let topLevel = "";
  let cursor = 0;
  let from = source.indexOf("@media ", cursor);
  while (from !== -1) {
    const open = source.indexOf("{", from);
    const query = source.slice(from + "@media ".length, open).trim();
    let depth = 1;
    let index = open + 1;
    while (depth > 0 && index < source.length) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") depth -= 1;
      index += 1;
    }
    topLevel += source.slice(cursor, from);
    blocksByQuery.set(query, [...(blocksByQuery.get(query) ?? []), source.slice(open + 1, index - 1)]);
    cursor = index;
    from = source.indexOf("@media ", cursor);
  }
  topLevel += source.slice(cursor);
  return { topLevel, media: (query: string) => (blocksByQuery.get(query) ?? []).join("\n") };
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Declarations of every rule whose selector list contains `selector`, in source order. */
const declarationsFor = (source: string, selector: string): string => {
  const matches: string[] = [];
  for (const match of source.matchAll(/(?:^|[\n}])([^{}]*?)\{([^{}]*)\}/g)) {
    const selectors = (match[1] ?? "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(",")
      .map((part) => part.trim());
    if (selectors.includes(selector)) {
      matches.push(match[2] ?? "");
    }
  }
  return matches.join("\n");
};

/** Last value declared for `property`, as the cascade would resolve it within one block. */
const declarationValue = (declarations: string, property: string): string | null => {
  const pattern = new RegExp(`(?:^|[;\\s])${escapeRegExp(property)}:\\s*([^;]+);`, "g");
  const values = [...declarations.matchAll(pattern)].map((match) => (match[1] ?? "").trim());
  return values.at(-1) ?? null;
};

const { topLevel, media } = splitMediaBlocks(css);
const stacked = media("(max-width: 1024px)");
const phone = media("(max-width: 768px), (max-width: 1024px) and (max-height: 520px)");

describe("narrow-screen layout styles", () => {
  it("lets the stacked layout grow past one screen height instead of overlapping rows", () => {
    for (const selector of [
      "#root",
      ".app-shell",
      ".people-layout",
      ".workspace-main",
      ".workspace-context-pane"
    ]) {
      expect(declarationValue(declarationsFor(stacked, selector), "height"), selector).toBe("auto");
    }
    expect(declarationValue(declarationsFor(stacked, ".workspace-nav"), "overflow")).toBe("visible");
  });

  it("shows a pane that was collapsed on desktop, since the column toggles are hidden when stacked", () => {
    const closed = declarationsFor(stacked, ".workspace-pane--closed");
    expect(declarationValue(closed, "visibility")).toBe("visible");
    expect(declarationValue(closed, "pointer-events")).toBe("auto");
  });

  it("keeps toasts on screen when the right column is stacked below", () => {
    const toast = declarationsFor(stacked, ".toast-viewport");
    expect(declarationValue(toast, "position")).toBe("fixed");
    expect(declarationValue(toast, "left")).toBe("12px");
    expect(declarationValue(toast, "right")).toBe("12px");
  });

  it("applies the phone rules to landscape phones as well as portrait", () => {
    expect(phone.length).toBeGreaterThan(0);
  });

  it("renders workspace navigation as a single scrolling row on phones", () => {
    const list = declarationsFor(phone, ".workspace-nav-list");
    expect(declarationValue(list, "flex-wrap")).toBe("nowrap");
    expect(declarationValue(list, "overflow-x")).toBe("auto");
    expect(declarationValue(declarationsFor(phone, ".workspace-nav"), "position")).toBe("sticky");
  });

  it("collapses graph filters behind the toolbar toggle on phones only", () => {
    expect(declarationValue(declarationsFor(topLevel, ".graph-filters-toggle"), "display")).toBe("none");
    expect(declarationValue(declarationsFor(phone, ".graph-filters-toggle"), "display")).toBe("inline-flex");
    expect(
      declarationValue(declarationsFor(phone, ".graph-bottom-left-controls--collapsible"), "display")
    ).toBe("none");
    expect(
      declarationValue(
        declarationsFor(phone, ".graph-bottom-left-controls--collapsible.graph-bottom-left-controls--open"),
        "display"
      )
    ).toBe("flex");
  });

  it("spans the search overlay and toolbar across the graph on phones", () => {
    const search = declarationsFor(phone, ".graph-search-overlay");
    expect(declarationValue(search, "left")).toBe("8px");
    expect(declarationValue(search, "right")).toBe("8px");
    expect(declarationValue(search, "width")).toBe("auto");
    expect(declarationValue(declarationsFor(phone, ".graph-bottom-right-controls"), "flex-direction")).toBe(
      "row"
    );
  });

  it("sizes dialogs including padding so they fit a phone screen", () => {
    expect(declarationValue(declarationsFor(phone, ".confirm-dialog"), "box-sizing")).toBe("border-box");
  });

  it("uses 16px form fields on phones so iOS Safari does not zoom on focus", () => {
    expect(declarationValue(declarationsFor(phone, "select"), "font-size")).toBe("16px !important");
    expect(declarationValue(declarationsFor(phone, "textarea"), "font-size")).toBe("16px !important");
  });

  it("keeps in-graph node chrome below the graph overlays", () => {
    const overlayZ = Math.min(
      ...[".graph-search-overlay", ".graph-bottom-left-controls", ".graph-bottom-right-controls"].map(
        (selector) => Number(declarationValue(declarationsFor(topLevel, selector), "z-index"))
      )
    );
    expect(Number.isFinite(overlayZ)).toBe(true);

    for (const source of [nodeActionButtonsSource, focusLockBadgeSource]) {
      const ranges = [...source.matchAll(/zIndexRange=\{\[(\d+),\s*(\d+)\]\}/g)];
      expect(ranges.length).toBeGreaterThan(0);
      for (const range of ranges) {
        expect(Number(range[1])).toBeLessThan(overlayZ);
      }
    }
  });
});
