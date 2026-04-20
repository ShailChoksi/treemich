import type { ImmichPerson } from "../../lib/api";
import { distanceSquared, type NodePosition } from "./layout";

/** Keeps up to `limit` items closest to `origin` (by squared distance). */
export const pickNearest = (
  items: Array<{ person: ImmichPerson; position: NodePosition }>,
  origin: NodePosition,
  limit: number
) => {
  if (items.length <= limit) {
    return items;
  }

  const nearest: Array<{ item: { person: ImmichPerson; position: NodePosition }; distance: number }> = [];
  for (const item of items) {
    const candidate = {
      item,
      distance: distanceSquared(item.position, origin)
    };

    if (nearest.length === 0) {
      nearest.push(candidate);
      continue;
    }

    let insertAt = nearest.length;
    while (insertAt > 0 && nearest[insertAt - 1] && nearest[insertAt - 1]!.distance > candidate.distance) {
      insertAt -= 1;
    }

    if (nearest.length < limit) {
      nearest.splice(insertAt, 0, candidate);
      continue;
    }

    const last = nearest[nearest.length - 1];
    if (!last || candidate.distance >= last.distance) {
      continue;
    }

    nearest.splice(insertAt, 0, candidate);
    nearest.pop();
  }

  return nearest.map((entry) => entry.item);
};
