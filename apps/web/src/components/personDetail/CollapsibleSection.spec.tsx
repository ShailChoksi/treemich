import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import "../../styles.css";
import { CollapsibleSection } from "./CollapsibleSection";

const reactTestEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnv.IS_REACT_ACT_ENVIRONMENT = true;

describe("CollapsibleSection", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps a stable region id in the DOM and toggles hidden when collapsed", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const contentId = "person-detail-section-content-test-sec";
    act(() => {
      root.render(
        createElement(CollapsibleSection, {
          sectionKey: "test-sec",
          title: "T",
          isCollapsed: true,
          onToggleCollapsed: () => {},
          children: createElement("p", null, "body")
        })
      );
    });
    const region = document.getElementById(contentId);
    expect(region).toBeTruthy();
    expect(region?.hasAttribute("hidden")).toBe(true);
    expect(window.getComputedStyle(region as HTMLElement).display).toBe("none");
    act(() => {
      root.render(
        createElement(CollapsibleSection, {
          sectionKey: "test-sec",
          title: "T",
          isCollapsed: false,
          onToggleCollapsed: () => {},
          children: createElement("p", null, "body")
        })
      );
    });
    const region2 = document.getElementById(contentId);
    expect(region2?.hasAttribute("hidden")).toBe(false);
    expect(window.getComputedStyle(region2 as HTMLElement).display).not.toBe("none");
  });
});
