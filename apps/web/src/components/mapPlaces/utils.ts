import type { PlacesMapPoint } from "../../lib/api";

export type PlaceCluster = {
  id: string;
  latitude: number;
  longitude: number;
  eventCount: number;
  personCount: number;
  placeCount: number;
  samplePersonIds: string[];
  placeNames: string[];
  points: PlacesMapPoint[];
};

export const filterPlaces = (
  places: PlacesMapPoint[],
  options: { search: string; minEvents: number }
): PlacesMapPoint[] => {
  const search = options.search.trim().toLowerCase();
  return places
    .filter((point) => point.eventCount >= options.minEvents)
    .filter((point) => (search.length > 0 ? point.name.toLowerCase().includes(search) : true));
};

export const clusterPlaces = (places: PlacesMapPoint[], cellDegrees: number): PlaceCluster[] => {
  if (places.length === 0) {
    return [];
  }
  const cell = Math.max(0.05, cellDegrees);
  const byCell = new Map<string, PlaceCluster>();
  for (const point of places) {
    const latCell = Math.round(point.latitude / cell);
    const lngCell = Math.round(point.longitude / cell);
    const key = `${latCell}:${lngCell}`;
    const existing = byCell.get(key) ?? {
      id: key,
      latitude: 0,
      longitude: 0,
      eventCount: 0,
      personCount: 0,
      placeCount: 0,
      samplePersonIds: [],
      placeNames: [],
      points: []
    };
    existing.latitude += point.latitude * point.eventCount;
    existing.longitude += point.longitude * point.eventCount;
    existing.eventCount += point.eventCount;
    existing.placeCount += 1;
    existing.points.push(point);
    existing.placeNames.push(point.name);
    const nextPersonIds = new Set([...existing.samplePersonIds, ...point.samplePersonIds]);
    existing.samplePersonIds = [...nextPersonIds]
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 5);
    byCell.set(key, existing);
  }

  return [...byCell.values()]
    .map((cluster) => ({
      ...cluster,
      latitude: cluster.eventCount > 0 ? cluster.latitude / cluster.eventCount : cluster.latitude,
      longitude: cluster.eventCount > 0 ? cluster.longitude / cluster.eventCount : cluster.longitude,
      personCount: cluster.points.reduce((sum, point) => sum + point.personCount, 0)
    }))
    .sort((left, right) => right.eventCount - left.eventCount || left.id.localeCompare(right.id));
};
