import { describe, expect, it } from "vitest";
import { buildPhotoCooccurrenceResult, buildPhotoCooccurrenceStats } from "./cooccurrence.js";
import type { ImmichAssetPeople } from "../integrations/immich/client.js";

describe("photo co-occurrence helpers", () => {
  it("builds pair counts from shared photo appearances", () => {
    const assets: ImmichAssetPeople[] = [
      { assetId: "a1", personIds: ["p1", "p2", "p3"] },
      { assetId: "a2", personIds: ["p1", "p2"] },
      { assetId: "a3", personIds: ["p2", "p3"] },
      { assetId: "a4", personIds: ["p4", "p5"] }
    ];

    const stats = buildPhotoCooccurrenceStats(assets);
    expect(stats.sourcePhotoCount).toBe(4);
    expect(stats.personPhotoCounts.get("p2")).toBe(3);
    expect(stats.pairSharedCounts.get("p1|p2")).toBe(2);
    expect(stats.pairSharedCounts.get("p1|p3")).toBe(1);
    expect(stats.pairSharedCounts.get("p2|p3")).toBe(2);
  });

  it("creates thresholded edges and deterministic clusters", () => {
    const assets: ImmichAssetPeople[] = [
      { assetId: "a1", personIds: ["p1", "p2", "p3"] },
      { assetId: "a2", personIds: ["p1", "p2"] },
      { assetId: "a3", personIds: ["p2", "p3"] },
      { assetId: "a4", personIds: ["p4", "p5"] }
    ];

    const result = buildPhotoCooccurrenceResult(buildPhotoCooccurrenceStats(assets), {
      minSharedPhotos: 2,
      minScore: 0
    });

    expect(result.edges).toHaveLength(2);
    expect(result.edges[0]).toMatchObject({
      personAId: "p1",
      personBId: "p2",
      sharedPhotos: 2
    });
    expect(result.clusters[0]).toEqual({
      id: "cluster-p1",
      personIds: ["p1", "p2", "p3"],
      size: 3
    });
    expect(result.clusters.map((cluster) => cluster.size)).toEqual([3, 1, 1]);
  });

  it("filters out weak links by normalized score", () => {
    const result = buildPhotoCooccurrenceResult(
      {
        sourcePhotoCount: 12,
        personPhotoCounts: new Map([
          ["p1", 4],
          ["p2", 4],
          ["p3", 2]
        ]),
        pairSharedCounts: new Map([
          ["p1|p2", 1],
          ["p1|p3", 1]
        ])
      },
      {
      minSharedPhotos: 1,
      minScore: 0.5
      }
    );

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      personAId: "p1",
      personBId: "p3",
      score: 0.5
    });
    expect(result.clusters[0]).toEqual({
      id: "cluster-p1",
      personIds: ["p1", "p3"],
      size: 2
    });
  });
});
