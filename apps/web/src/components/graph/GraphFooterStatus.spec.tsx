import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { GRAPH_FOOTER_THUMBNAIL_PROGRESS_MIN_TOTAL, GraphFooterStatus } from "./GraphFooterStatus";

const reactTestEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnv.IS_REACT_ACT_ENVIRONMENT = true;

describe("GraphFooterStatus", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows thumbnail progress when total is at the minimum and loading is incomplete", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(GraphFooterStatus, {
          status: null,
          busy: false,
          thumbnailProgress: { loaded: 0, total: GRAPH_FOOTER_THUMBNAIL_PROGRESS_MIN_TOTAL }
        })
      );
    });

    expect(container.textContent).toContain("Loading faces");
    expect(container.textContent).toContain(`0/${GRAPH_FOOTER_THUMBNAIL_PROGRESS_MIN_TOTAL}`);
    root.unmount();
  });

  it("hides thumbnail progress when total is below the minimum", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(GraphFooterStatus, {
          status: null,
          busy: false,
          thumbnailProgress: {
            loaded: 0,
            total: GRAPH_FOOTER_THUMBNAIL_PROGRESS_MIN_TOTAL - 1
          }
        })
      );
    });

    expect(container.textContent).not.toContain("Loading faces");
    root.unmount();
  });

  it("hides thumbnail progress when all thumbnails are loaded", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const total = GRAPH_FOOTER_THUMBNAIL_PROGRESS_MIN_TOTAL;

    await act(async () => {
      root.render(
        createElement(GraphFooterStatus, {
          status: null,
          busy: false,
          thumbnailProgress: { loaded: total, total }
        })
      );
    });

    expect(container.textContent).not.toContain("Loading faces");
    root.unmount();
  });
});
