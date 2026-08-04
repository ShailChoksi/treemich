/**
 * @file Read-only 2D Focus cone for guest Focus Share viewers.
 */

import { useMemo } from "react";
import {
  positionGenerationTreePeople,
  relationshipTypes,
  type FocusShareGuestPerson,
  type FocusShareGuestRelationship,
  type RelationshipType
} from "@treemich/shared";
import { guestFocusShareThumbnailUrl } from "../../lib/api";

type Props = {
  people: FocusShareGuestPerson[];
  relationships: FocusShareGuestRelationship[];
  focusAnchorPersonId: string;
};

const SCALE_X = 92;
const SCALE_Y = 110;
const NODE_R = 28;
const PAD = 72;

const relationshipTypeSet = new Set<string>(relationshipTypes);
const isRelationshipType = (value: string): value is RelationshipType => relationshipTypeSet.has(value);

export const GuestFocusGraph = ({ people, relationships, focusAnchorPersonId }: Props) => {
  const layout = useMemo(() => {
    const layoutRelationships = relationships
      .filter((edge) => isRelationshipType(edge.type))
      .map((edge) => ({
        fromPersonId: edge.fromPersonId,
        toPersonId: edge.toPersonId,
        type: edge.type as RelationshipType
      }));
    const positioned = positionGenerationTreePeople(
      people.map((person) => ({ id: person.id, name: person.name })),
      layoutRelationships,
      {
        treeLayoutPreferences: {
          horizontalSpacing: 1.15,
          verticalSpacing: 1.05
        }
      }
    );
    const byId = new Map(positioned.map((item) => [item.person.id, item.position]));
    const points = people.map((person) => {
      const position = byId.get(person.id) ?? [0, 0, 0];
      return {
        person,
        x: position[0] * SCALE_X,
        y: -position[1] * SCALE_Y
      };
    });
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      maxX = 0;
      minY = 0;
      maxY = 0;
    }
    const width = Math.max(320, maxX - minX + PAD * 2);
    const height = Math.max(240, maxY - minY + PAD * 2);
    const offsetX = PAD - minX;
    const offsetY = PAD - minY;
    const nodeById = new Map(
      points.map((point) => [point.person.id, { ...point, x: point.x + offsetX, y: point.y + offsetY }])
    );
    const edges = relationships
      .map((edge) => {
        const from = nodeById.get(edge.fromPersonId);
        const to = nodeById.get(edge.toPersonId);
        if (!from || !to) {
          return null;
        }
        return { id: edge.id, type: edge.type, from, to };
      })
      .filter((edge): edge is NonNullable<typeof edge> => edge != null);

    return { width, height, nodes: [...nodeById.values()], edges };
  }, [people, relationships]);

  if (people.length === 0) {
    return <p className="hint">No people in this Focus view.</p>;
  }

  return (
    <div className="guest-focus-graph" aria-label="Shared family graph">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width="100%"
        height="100%"
        role="img"
        aria-label={`${people.length} people in the shared Focus view`}
      >
        {layout.edges.map((edge) => (
          <line
            key={edge.id}
            className={`guest-focus-edge guest-focus-edge--${edge.type.toLowerCase()}`}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
          />
        ))}
        {layout.nodes.map(({ person, x, y }) => {
          const isAnchor = person.id === focusAnchorPersonId;
          return (
            <g key={person.id} transform={`translate(${x} ${y})`}>
              <circle
                className={isAnchor ? "guest-focus-node guest-focus-node--anchor" : "guest-focus-node"}
                r={NODE_R}
              />
              <clipPath id={`guest-thumb-clip-${person.id}`}>
                <circle r={NODE_R - 2} />
              </clipPath>
              <image
                href={guestFocusShareThumbnailUrl(person.id)}
                width={(NODE_R - 2) * 2}
                height={(NODE_R - 2) * 2}
                x={-(NODE_R - 2)}
                y={-(NODE_R - 2)}
                clipPath={`url(#guest-thumb-clip-${person.id})`}
                preserveAspectRatio="xMidYMid slice"
              />
              <text className="guest-focus-label" y={NODE_R + 16} textAnchor="middle">
                {person.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
