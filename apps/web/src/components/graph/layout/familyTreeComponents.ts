/**
 * @file Family-tree layout math: familyTreeComponents.
 */

import type { NodePosition } from "./types";

export const collectConnectedComponents = (undirected: Map<string, Set<string>>) => {
  const components: string[][] = [];
  const visited = new Set<string>();
  for (const startId of undirected.keys()) {
    if (visited.has(startId)) {
      continue;
    }
    const stack = [startId];
    const component: string[] = [];
    visited.add(startId);

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      component.push(current);
      for (const next of undirected.get(current) ?? []) {
        if (visited.has(next)) {
          continue;
        }
        visited.add(next);
        stack.push(next);
      }
    }

    components.push(component);
  }
  return components;
};

export const buildComponentCenters = (
  components: string[][],
  componentGapX: number,
  componentGapZ: number
) => {
  const componentLayoutColumns = Math.max(1, Math.ceil(Math.sqrt(components.length)));
  const componentSpanByIndex = components.map((component) => {
    const nodeCount = Math.max(component.length, 1);
    return {
      x: Math.max(14, Math.sqrt(nodeCount) * 8),
      z: Math.max(10, Math.sqrt(nodeCount) * 4.5)
    };
  });
  const rowCount = Math.ceil(components.length / componentLayoutColumns);
  const rowMaxSpanZ: number[] = [];
  const rowSpanX: number[] = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const start = rowIndex * componentLayoutColumns;
    const end = Math.min(start + componentLayoutColumns, components.length);
    const spans = componentSpanByIndex.slice(start, end);
    const maxZ = spans.length > 0 ? Math.max(...spans.map((span) => span.z)) : 10;
    const totalX =
      spans.reduce((sum, span) => sum + span.x, 0) + Math.max(spans.length - 1, 0) * componentGapX;
    rowSpanX.push(totalX);
    rowMaxSpanZ.push(maxZ);
  }
  const totalSpanZ =
    rowMaxSpanZ.reduce((sum, span) => sum + span, 0) + Math.max(rowCount - 1, 0) * componentGapZ;
  const componentCenterByIndex = new Map<number, NodePosition>();
  let zCursor = -totalSpanZ / 2;
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowStart = rowIndex * componentLayoutColumns;
    const rowEnd = Math.min(rowStart + componentLayoutColumns, components.length);
    const rowHeight = rowMaxSpanZ[rowIndex] ?? 10;
    const rowWidth = rowSpanX[rowIndex] ?? 14;
    const rowCenterZ = zCursor + rowHeight / 2;
    let xCursor = -rowWidth / 2;

    for (let componentIndex = rowStart; componentIndex < rowEnd; componentIndex += 1) {
      const span = componentSpanByIndex[componentIndex];
      if (!span) {
        continue;
      }
      const componentCenterX = xCursor + span.x / 2;
      componentCenterByIndex.set(componentIndex, [componentCenterX, 0, rowCenterZ]);
      xCursor += span.x + componentGapX;
    }

    zCursor += rowHeight + componentGapZ;
  }
  return componentCenterByIndex;
};
