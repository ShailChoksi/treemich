import { describe, expect, it } from "vitest";
import { instancedNodeLayerZ } from "./nodeInstancedMeshConstants";

describe("instanced node layer ordering", () => {
  it("keeps instanced disk and ring behind per-person thumbnail meshes", () => {
    expect(instancedNodeLayerZ.disk).toBeLessThan(0);
    expect(instancedNodeLayerZ.ring).toBeLessThan(0);
    expect(instancedNodeLayerZ.disk).toBeLessThan(instancedNodeLayerZ.ring);
  });
});
