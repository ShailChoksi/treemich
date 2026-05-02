import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRAPH_UI_SNAPSHOT,
  DEFAULT_MAP_UI_SNAPSHOT,
  parseGraphUiSnapshot,
  parseMapUiSnapshot
} from "./workspaceUiState";

describe("workspace UI state snapshots", () => {
  it("parses valid graph snapshots", () => {
    expect(
      parseGraphUiSnapshot(
        JSON.stringify({
          schemaVersion: 2,
          searchTerm: "alex",
          focusPersonId: "p1",
          pinnedPersonId: "p2",
          highlightedPersonIds: ["p1", "p3", "p1", ""],
          camera: {
            position: [1, 2, 3],
            target: [4, 5, 6]
          },
          cameraIntent: "explicitFocus",
          cameraPersonId: "p1"
        })
      )
    ).toEqual({
      schemaVersion: 2,
      searchTerm: "alex",
      focusPersonId: "p1",
      pinnedPersonId: "p2",
      highlightedPersonIds: ["p1", "p3"],
      camera: {
        position: [1, 2, 3],
        target: [4, 5, 6]
      },
      cameraIntent: "explicitFocus",
      cameraPersonId: "p1"
    });
  });

  it("migrates v1 graph snapshots with a saved camera to v2 with cameraIntent manual", () => {
    expect(
      parseGraphUiSnapshot(
        JSON.stringify({
          schemaVersion: 1,
          searchTerm: "alex",
          focusPersonId: "p1",
          pinnedPersonId: "p2",
          highlightedPersonIds: ["p1", "p3", "p1", ""],
          camera: {
            position: [1, 2, 3],
            target: [4, 5, 6]
          }
        })
      )
    ).toEqual({
      schemaVersion: 2,
      searchTerm: "alex",
      focusPersonId: "p1",
      pinnedPersonId: "p2",
      highlightedPersonIds: ["p1", "p3"],
      camera: {
        position: [1, 2, 3],
        target: [4, 5, 6]
      },
      cameraIntent: "manual",
      cameraPersonId: "p1"
    });
  });

  it("falls back for corrupted graph snapshots", () => {
    expect(parseGraphUiSnapshot("{bad")).toEqual(DEFAULT_GRAPH_UI_SNAPSHOT);
    expect(parseGraphUiSnapshot(JSON.stringify({ schemaVersion: 999 }))).toEqual(DEFAULT_GRAPH_UI_SNAPSHOT);
  });

  it("parses and clamps map snapshots", () => {
    expect(
      parseMapUiSnapshot(
        JSON.stringify({
          schemaVersion: 1,
          search: "boston",
          minEvents: 500,
          baseClusterCellDegrees: -2,
          center: [42.36, -71.05],
          zoom: 99
        })
      )
    ).toEqual({
      schemaVersion: 1,
      search: "boston",
      minEvents: 20,
      baseClusterCellDegrees: 0.2,
      center: [42.36, -71.05],
      zoom: 18
    });
  });

  it("falls back for corrupted map snapshots", () => {
    expect(parseMapUiSnapshot("{bad")).toEqual(DEFAULT_MAP_UI_SNAPSHOT);
    expect(parseMapUiSnapshot(JSON.stringify({ schemaVersion: 999 }))).toEqual(DEFAULT_MAP_UI_SNAPSHOT);
  });
});
