import { act, createElement, type ReactNode, useState } from "react";
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
    getCenter: vi.fn(() => ({ lat: 20, lng: 0 })),
    getBounds: vi.fn(() => createBounds(-90, -180, 90, 180)),
    fitBounds,
    invalidateSize: vi.fn()
  };
  const zoomHandlers: Array<() => void> = [];
  const moveHandlers: Array<() => void> = [];
  return { fitBounds, map, zoomHandlers, moveHandlers, createBounds };
});

vi.mock("react-leaflet", () => ({
  MapContainer: ({
    children,
    className,
    center,
    zoom
  }: {
    children: ReactNode;
    className?: string;
    center?: [number, number];
    zoom?: number;
  }) =>
    createElement(
      "div",
      { className, "data-center": center?.join(","), "data-zoom": String(zoom ?? "") },
      children
    ),
  TileLayer: () => createElement("div"),
  CircleMarker: ({ children, pathOptions }: { children: ReactNode; pathOptions?: { fillColor?: string } }) =>
    createElement("div", { "data-marker-fill": pathOptions?.fillColor ?? "" }, children),
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
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    leafletMocks.fitBounds.mockClear();
    leafletMocks.map.getZoom.mockReset();
    leafletMocks.map.getZoom.mockReturnValue(2);
    leafletMocks.map.getCenter.mockReset();
    leafletMocks.map.getCenter.mockReturnValue({ lat: 20, lng: 0 });
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
    act(() => {
      root.unmount();
    });
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
    act(() => {
      root.unmount();
    });
  });

  it("shows the map canvas when geocoded places are available", async () => {
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
    expect(container.querySelector(".map-places-panel")).toBeTruthy();
    expect(container.querySelector(".map-places-canvas")).toBeTruthy();
    act(() => {
      root.unmount();
    });
  });

  it("renders the map in the main panel container", async () => {
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
    expect(container.querySelector(".map-places-canvas")).toBeTruthy();
    act(() => {
      root.unmount();
    });
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
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      checkbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onIncludeLivingChange).toHaveBeenCalled();
    act(() => {
      root.unmount();
    });
  });

  it("styles cluster markers green when selected person appears in cluster sample ids", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(MapPlacesPanel, {
          mapUiEnabled: true,
          places: [
            {
              id: "pl-paris",
              name: "Paris",
              latitude: 48.8566,
              longitude: 2.3522,
              eventCount: 2,
              personCount: 1,
              lastEventYear: 1990,
              samplePersonIds: ["person-a"]
            },
            {
              id: "pl-tokyo",
              name: "Tokyo",
              latitude: 35.6764,
              longitude: 139.65,
              eventCount: 1,
              personCount: 1,
              lastEventYear: 1991,
              samplePersonIds: ["person-b"]
            }
          ],
          includeLiving: true,
          selectedPersonId: "person-a",
          onIncludeLivingChange: vi.fn(),
          onFocusPerson: vi.fn(),
          getPersonLabel: (id: string) => id
        })
      );
    });
    const fills = [...container.querySelectorAll("[data-marker-fill]")].map((el) =>
      el.getAttribute("data-marker-fill")
    );
    expect(fills).toContain("#22c55e");
    expect(fills).toContain("#3b82f6");
    expect(container.textContent).toContain("sample ids from the map feed");
    act(() => {
      root.unmount();
    });
  });

  it("keeps map controls visible when living filter yields zero places", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const point = {
      id: "pl1",
      name: "Paris",
      latitude: 48.8566,
      longitude: 2.3522,
      eventCount: 2,
      personCount: 1,
      lastEventYear: 1980,
      samplePersonIds: ["p1"]
    };
    const Harness = () => {
      const [includeLiving, setIncludeLiving] = useState(true);
      return createElement(MapPlacesPanel, {
        mapUiEnabled: true,
        places: includeLiving ? [point] : [],
        includeLiving,
        onIncludeLivingChange: setIncludeLiving,
        onFocusPerson: vi.fn(),
        getPersonLabel: (id: string) => id
      });
    };
    await act(async () => {
      root.render(createElement(Harness));
    });
    let checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(checkbox).toBeTruthy();
    await act(async () => {
      checkbox?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.textContent).toContain("No deceased-people places found");
    expect(container.textContent).toContain("Include living people places");
    checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(checkbox).toBeTruthy();
    act(() => {
      root.unmount();
    });
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
    const focusButtons = [...container.querySelectorAll("button")].filter((node) =>
      node.textContent?.includes("Focus Person")
    );
    expect(focusButtons.length).toBeGreaterThan(0);
    await act(async () => {
      (focusButtons[0] as HTMLButtonElement).click();
    });
    expect(onFocusPerson).toHaveBeenCalledWith("p1");
    act(() => {
      root.unmount();
    });
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
    expect(leafletMocks.fitBounds.mock.calls.length).toBe(0);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(leafletMocks.fitBounds).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
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
    expect(container.textContent).toContain("at zoom 2.0");
    leafletMocks.map.getZoom.mockReturnValue(8);
    await act(async () => {
      for (const handler of leafletMocks.zoomHandlers) {
        handler();
      }
    });
    expect(container.textContent).toContain("at zoom 8.0");
    act(() => {
      root.unmount();
    });
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
    expect(container.textContent).toContain("2 in view");

    leafletMocks.map.getBounds.mockReturnValue(leafletMocks.createBounds(40, -10, 55, 10));
    await act(async () => {
      for (const handler of leafletMocks.moveHandlers) {
        handler();
      }
    });
    expect(container.textContent).toContain("1 in view");
    act(() => {
      root.unmount();
    });
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
    act(() => {
      root.unmount();
    });
  });

  it("restores filter and viewport state from the initial snapshot", async () => {
    vi.useFakeTimers();
    const onUiStateChange = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    leafletMocks.map.getCenter.mockReturnValue({ lat: 42.36, lng: -71.05 });
    leafletMocks.map.getZoom.mockReturnValue(8);
    await act(async () => {
      root.render(
        createElement(MapPlacesPanel, {
          mapUiEnabled: true,
          places: [
            {
              id: "pl1",
              name: "Boston",
              latitude: 42.3601,
              longitude: -71.0589,
              eventCount: 4,
              personCount: 1,
              lastEventYear: 1980,
              samplePersonIds: ["p1"]
            }
          ],
          includeLiving: true,
          onIncludeLivingChange: vi.fn(),
          onFocusPerson: vi.fn(),
          getPersonLabel: (id: string) => id,
          initialUiState: {
            schemaVersion: 1,
            search: "bos",
            minEvents: 3,
            baseClusterCellDegrees: 2.4,
            center: [42.36, -71.05],
            zoom: 8
          },
          onUiStateChange
        })
      );
    });

    const canvas = container.querySelector(".map-places-canvas");
    expect((container.querySelector(".map-places-search") as HTMLInputElement | null)?.value).toBe("bos");
    expect(container.textContent).toContain("Min events: 3");
    expect(container.textContent).toContain("Cluster base radius: 2.4");
    expect(canvas?.getAttribute("data-center")).toBe("42.36,-71.05");
    expect(canvas?.getAttribute("data-zoom")).toBe("8");

    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    expect(leafletMocks.fitBounds).not.toHaveBeenCalled();
    expect(onUiStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        search: "bos",
        minEvents: 3,
        baseClusterCellDegrees: 2.4,
        center: expect.any(Array),
        zoom: expect.any(Number)
      })
    );
    act(() => {
      root.unmount();
    });
  });

  it("renders an explicit retry action for map load failures", async () => {
    const onRetry = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(MapPlacesPanel, {
          mapUiEnabled: true,
          places: null,
          includeLiving: true,
          onIncludeLivingChange: vi.fn(),
          onFocusPerson: vi.fn(),
          getPersonLabel: (id: string) => id,
          error: "Map feed failed",
          onRetry
        })
      );
    });

    const retryButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Retry map load")
    );
    expect(container.textContent).toContain("Map feed failed");
    expect(retryButton).toBeTruthy();

    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
  });
});
