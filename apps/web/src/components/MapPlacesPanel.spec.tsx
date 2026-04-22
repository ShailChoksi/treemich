import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapPlacesPanel } from "./MapPlacesPanel";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const leafletMocks = vi.hoisted(() => {
  const createBounds = (south: number, west: number, north: number, east: number) => ({
    getSouth: () => south,
    getWest: () => west,
    getNorth: () => north,
    getEast: () => east
  });
  const fitBounds = vi.fn();
  const map = {
    getZoom: vi.fn(() => 2),
    getBounds: vi.fn(() => createBounds(-90, -180, 90, 180)),
    fitBounds
  };
  const zoomHandlers: Array<() => void> = [];
  const moveHandlers: Array<() => void> = [];
  return { fitBounds, map, zoomHandlers, moveHandlers, createBounds };
});

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => createElement("div", {}, children),
  TileLayer: () => createElement("div"),
  CircleMarker: ({ children }: { children: ReactNode }) => createElement("div", {}, children),
  Popup: ({ children }: { children: ReactNode }) => createElement("div", {}, children),
  useMap: () => leafletMocks.map,
  useMapEvents: (handlers: { zoomend?: () => void; moveend?: () => void }) => {
    if (handlers.zoomend) {
      leafletMocks.zoomHandlers.push(handlers.zoomend);
    }
    if (handlers.moveend) {
      leafletMocks.moveHandlers.push(handlers.moveend);
    }
    return leafletMocks.map;
  }
}));

describe("MapPlacesPanel", () => {
  const expandMap = async (container: HTMLDivElement) => {
    const toggle = [...container.querySelectorAll("button")].find((node) =>
      node.textContent?.includes("Show map")
    ) as HTMLButtonElement | undefined;
    expect(toggle).toBeDefined();
    await act(async () => {
      toggle?.click();
    });
  };

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    leafletMocks.fitBounds.mockClear();
    leafletMocks.map.getZoom.mockReset();
    leafletMocks.map.getZoom.mockReturnValue(2);
    leafletMocks.map.getBounds.mockReset();
    leafletMocks.map.getBounds.mockReturnValue(leafletMocks.createBounds(-90, -180, 90, 180));
    leafletMocks.zoomHandlers.splice(0, leafletMocks.zoomHandlers.length);
    leafletMocks.moveHandlers.splice(0, leafletMocks.moveHandlers.length);
    vi.useRealTimers();
  });

  it("renders loading state", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MapPlacesPanel, {
          mapUiEnabled: true,
          places: null,
          isLoading: true,
          includeLiving: true,
          onIncludeLivingChange: vi.fn(),
          onFocusPerson: vi.fn(),
          getPersonLabel: (id: string) => id
        })
      );
    });
    expect(container.textContent).toContain("Loading geocoded places");
    root.unmount();
  });

  it("can rerender from loading state to loaded state without hook-order crash", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MapPlacesPanel, {
          mapUiEnabled: true,
          places: null,
          isLoading: true,
          includeLiving: true,
          onIncludeLivingChange: vi.fn(),
          onFocusPerson: vi.fn(),
          getPersonLabel: (id: string) => id
        })
      );
    });
    expect(container.textContent).toContain("Loading geocoded places");

    await act(async () => {
      root.render(
        createElement(MapPlacesPanel, {
          mapUiEnabled: true,
          places: [
            {
              id: "pl1",
              name: "Paris",
              latitude: 48.8566,
              longitude: 2.3522,
              eventCount: 2,
              personCount: 1,
              lastEventYear: 1980,
              samplePersonIds: ["p1"]
            }
          ],
          isLoading: false,
          includeLiving: true,
          onIncludeLivingChange: vi.fn(),
          onFocusPerson: vi.fn(),
          getPersonLabel: (id: string) => id
        })
      );
    });

    expect(container.textContent).toContain("Geocoded life-event places");
    root.unmount();
  });

  it("starts collapsed to keep sidebar compact", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MapPlacesPanel, {
          mapUiEnabled: true,
          places: [
            {
              id: "pl1",
              name: "Paris",
              latitude: 48.8566,
              longitude: 2.3522,
              eventCount: 2,
              personCount: 1,
              lastEventYear: 1980,
              samplePersonIds: ["p1"]
            }
          ],
          includeLiving: true,
          onIncludeLivingChange: vi.fn(),
          onFocusPerson: vi.fn(),
          getPersonLabel: (id: string) => id
        })
      );
    });
    expect(container.textContent).toContain("Map is collapsed");
    expect(container.textContent).toContain("Show map");
    root.unmount();
  });

  it("renders expanded content inside the map popout container", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MapPlacesPanel, {
          mapUiEnabled: true,
          places: [
            {
              id: "pl1",
              name: "Paris",
              latitude: 48.8566,
              longitude: 2.3522,
              eventCount: 2,
              personCount: 1,
              lastEventYear: 1980,
              samplePersonIds: ["p1"]
            }
          ],
          includeLiving: true,
          onIncludeLivingChange: vi.fn(),
          onFocusPerson: vi.fn(),
          getPersonLabel: (id: string) => id
        })
      );
    });
    const toggle = [...container.querySelectorAll("button")].find((node) =>
      node.textContent?.includes("Show map")
    ) as HTMLButtonElement | undefined;
    await act(async () => {
      toggle?.click();
    });
    expect(container.querySelector(".map-places-popout")).toBeTruthy();
    root.unmount();
  });

  it("calls includeLiving change handler from toggle", async () => {
    const onIncludeLivingChange = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MapPlacesPanel, {
          mapUiEnabled: true,
          places: [
            {
              id: "pl1",
              name: "Paris",
              latitude: 48.8566,
              longitude: 2.3522,
              eventCount: 2,
              personCount: 1,
              lastEventYear: 1980,
              samplePersonIds: ["p1"]
            }
          ],
          includeLiving: true,
          onIncludeLivingChange,
          onFocusPerson: vi.fn(),
          getPersonLabel: (id: string) => id
        })
      );
    });
    await expandMap(container);
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      checkbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onIncludeLivingChange).toHaveBeenCalled();
    root.unmount();
  });

  it("renders focus buttons and focuses person from popup controls", async () => {
    const onFocusPerson = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MapPlacesPanel, {
          mapUiEnabled: true,
          places: [
            {
              id: "pl1",
              name: "Paris",
              latitude: 48.8566,
              longitude: 2.3522,
              eventCount: 2,
              personCount: 2,
              lastEventYear: 1980,
              samplePersonIds: ["p1", "p2"]
            }
          ],
          includeLiving: true,
          onIncludeLivingChange: vi.fn(),
          onFocusPerson,
          getPersonLabel: (id: string) => `Person ${id}`
        })
      );
    });
    await expandMap(container);
    const focusButtons = [...container.querySelectorAll("button")].filter((node) =>
      node.textContent?.includes("Focus Person")
    );
    expect(focusButtons.length).toBeGreaterThan(0);
    await act(async () => {
      (focusButtons[0] as HTMLButtonElement).click();
    });
    expect(onFocusPerson).toHaveBeenCalledWith("p1");
    root.unmount();
  });

  it("debounces fitBounds calls", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MapPlacesPanel, {
          mapUiEnabled: true,
          places: [
            {
              id: "pl1",
              name: "Paris",
              latitude: 48.8566,
              longitude: 2.3522,
              eventCount: 2,
              personCount: 1,
              lastEventYear: 1980,
              samplePersonIds: ["p1"]
            }
          ],
          includeLiving: true,
          onIncludeLivingChange: vi.fn(),
          onFocusPerson: vi.fn(),
          getPersonLabel: (id: string) => id
        })
      );
    });
    await expandMap(container);
    expect(leafletMocks.fitBounds.mock.calls.length).toBe(0);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(leafletMocks.fitBounds).toHaveBeenCalledTimes(1);
    root.unmount();
  });

  it("updates adaptive cluster hint when zoom changes", async () => {
    leafletMocks.map.getZoom.mockReturnValue(2);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MapPlacesPanel, {
          mapUiEnabled: true,
          places: [
            {
              id: "pl1",
              name: "Paris",
              latitude: 48.8566,
              longitude: 2.3522,
              eventCount: 2,
              personCount: 1,
              lastEventYear: 1980,
              samplePersonIds: ["p1"]
            }
          ],
          includeLiving: true,
          onIncludeLivingChange: vi.fn(),
          onFocusPerson: vi.fn(),
          getPersonLabel: (id: string) => id
        })
      );
    });
    await expandMap(container);
    expect(container.textContent).toContain("at zoom 2.0");
    leafletMocks.map.getZoom.mockReturnValue(8);
    await act(async () => {
      for (const handler of leafletMocks.zoomHandlers) {
        handler();
      }
    });
    expect(container.textContent).toContain("at zoom 8.0");
    root.unmount();
  });

  it("clusters only points in the current viewport", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    leafletMocks.map.getBounds.mockReturnValue(leafletMocks.createBounds(-90, -180, 90, 180));
    await act(async () => {
      root.render(
        createElement(MapPlacesPanel, {
          mapUiEnabled: true,
          places: [
            {
              id: "pl1",
              name: "Paris",
              latitude: 48.8566,
              longitude: 2.3522,
              eventCount: 2,
              personCount: 1,
              lastEventYear: 1980,
              samplePersonIds: ["p1"]
            },
            {
              id: "pl2",
              name: "Tokyo",
              latitude: 35.6764,
              longitude: 139.6501,
              eventCount: 2,
              personCount: 1,
              lastEventYear: 1981,
              samplePersonIds: ["p2"]
            }
          ],
          includeLiving: true,
          onIncludeLivingChange: vi.fn(),
          onFocusPerson: vi.fn(),
          getPersonLabel: (id: string) => id
        })
      );
    });
    await expandMap(container);
    expect(container.textContent).toContain("2 in view");

    leafletMocks.map.getBounds.mockReturnValue(leafletMocks.createBounds(40, -10, 55, 10));
    await act(async () => {
      for (const handler of leafletMocks.moveHandlers) {
        handler();
      }
    });
    expect(container.textContent).toContain("1 in view");
    root.unmount();
  });

  it("does not re-trigger fitBounds on viewport-only move events", async () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MapPlacesPanel, {
          mapUiEnabled: true,
          places: [
            {
              id: "pl1",
              name: "Paris",
              latitude: 48.8566,
              longitude: 2.3522,
              eventCount: 2,
              personCount: 1,
              lastEventYear: 1980,
              samplePersonIds: ["p1"]
            }
          ],
          includeLiving: true,
          onIncludeLivingChange: vi.fn(),
          onFocusPerson: vi.fn(),
          getPersonLabel: (id: string) => id
        })
      );
    });
    await expandMap(container);

    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    expect(leafletMocks.fitBounds).toHaveBeenCalledTimes(1);

    await act(async () => {
      for (const handler of leafletMocks.moveHandlers) {
        handler();
      }
    });
    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    expect(leafletMocks.fitBounds).toHaveBeenCalledTimes(1);
    root.unmount();
  });
});
