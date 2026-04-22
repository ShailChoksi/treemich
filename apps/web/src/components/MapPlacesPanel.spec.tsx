import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapPlacesPanel } from "./MapPlacesPanel";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: ReactNode }) => createElement("div", {}, children),
  TileLayer: () => createElement("div"),
  CircleMarker: ({ children }: { children: ReactNode }) => createElement("div", {}, children),
  Popup: ({ children }: { children: ReactNode }) => createElement("div", {}, children),
  useMap: () => ({ fitBounds: vi.fn() })
}));

describe("MapPlacesPanel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
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
});
