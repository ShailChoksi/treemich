import { describe, expect, it } from "vitest";
import type { PlacesMapPoint } from "../../lib/api";
import { clusterPlaces, filterPlaces } from "./utils";

const point = (overrides: Partial<PlacesMapPoint>): PlacesMapPoint => ({
  id: overrides.id ?? "p",
  name: overrides.name ?? "Place",
  latitude: overrides.latitude ?? 0,
  longitude: overrides.longitude ?? 0,
  eventCount: overrides.eventCount ?? 1,
  personCount: overrides.personCount ?? 1,
  lastEventYear: overrides.lastEventYear ?? null,
  samplePersonIds: overrides.samplePersonIds ?? []
});

describe("filterPlaces", () => {
  it("filters by minimum event count", () => {
    const out = filterPlaces([point({ id: "a", eventCount: 1 }), point({ id: "b", eventCount: 5 })], {
      search: "",
      minEvents: 2
    });
    expect(out.map((p) => p.id)).toEqual(["b"]);
  });

  it("filters by case-insensitive place name search", () => {
    const out = filterPlaces([point({ id: "a", name: "Paris" }), point({ id: "b", name: "Boston" })], {
      search: "par",
      minEvents: 1
    });
    expect(out.map((p) => p.id)).toEqual(["a"]);
  });
});

describe("clusterPlaces", () => {
  it("returns empty for no points", () => {
    expect(clusterPlaces([], 1)).toEqual([]);
  });

  it("clusters nearby points into one cell", () => {
    const clusters = clusterPlaces(
      [
        point({ id: "a", latitude: 10.0, longitude: 20.0, eventCount: 2 }),
        point({ id: "b", latitude: 10.3, longitude: 20.4, eventCount: 3 })
      ],
      1
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.eventCount).toBe(5);
    expect(clusters[0]?.placeCount).toBe(2);
  });

  it("keeps distant points in separate clusters", () => {
    const clusters = clusterPlaces(
      [point({ id: "a", latitude: 0, longitude: 0 }), point({ id: "b", latitude: 20, longitude: 20 })],
      1
    );
    expect(clusters).toHaveLength(2);
  });

  it("merges and truncates sample person ids", () => {
    const clusters = clusterPlaces(
      [
        point({ id: "a", samplePersonIds: ["p3", "p1"] }),
        point({ id: "b", samplePersonIds: ["p2", "p4", "p5", "p6"] })
      ],
      5
    );
    expect(clusters[0]?.samplePersonIds).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });
});
