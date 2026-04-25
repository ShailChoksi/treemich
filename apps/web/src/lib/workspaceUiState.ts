/**
 * @file Serializable UI snapshots for workspace remount restore.
 */

export type Vector3Tuple = [number, number, number];
export type LatLngTuple = [number, number];

export type GraphUiSnapshot = {
  schemaVersion: 1;
  searchTerm: string;
  focusPersonId: string | null;
  pinnedPersonId: string | null;
  highlightedPersonIds: string[];
  camera: {
    position: Vector3Tuple;
    target: Vector3Tuple;
  } | null;
};

export type MapUiSnapshot = {
  schemaVersion: 1;
  search: string;
  minEvents: number;
  baseClusterCellDegrees: number;
  center: LatLngTuple | null;
  zoom: number;
};

export const GRAPH_UI_SNAPSHOT_VERSION = 1;
export const MAP_UI_SNAPSHOT_VERSION = 1;

export const DEFAULT_GRAPH_UI_SNAPSHOT: GraphUiSnapshot = {
  schemaVersion: GRAPH_UI_SNAPSHOT_VERSION,
  searchTerm: "",
  focusPersonId: null,
  pinnedPersonId: null,
  highlightedPersonIds: [],
  camera: null
};

export const DEFAULT_MAP_UI_SNAPSHOT: MapUiSnapshot = {
  schemaVersion: MAP_UI_SNAPSHOT_VERSION,
  search: "",
  minEvents: 1,
  baseClusterCellDegrees: 1.2,
  center: null,
  zoom: 2
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const parseVector3 = (value: unknown): Vector3Tuple | null => {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isFiniteNumber)) {
    return null;
  }
  return [value[0]!, value[1]!, value[2]!];
};

const parseLatLng = (value: unknown): LatLngTuple | null => {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(isFiniteNumber)) {
    return null;
  }
  const lat = value[0]!;
  const lng = value[1]!;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return [lat, lng];
};

const parseNullableString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value : null;

const parseStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))
  ];
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  if (!isFiniteNumber(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
};

export const parseGraphUiSnapshot = (raw: string | null): GraphUiSnapshot => {
  if (!raw) {
    return DEFAULT_GRAPH_UI_SNAPSHOT;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed) || parsed.schemaVersion !== GRAPH_UI_SNAPSHOT_VERSION) {
      return DEFAULT_GRAPH_UI_SNAPSHOT;
    }
    const cameraRecord = isObject(parsed.camera) ? parsed.camera : null;
    const camera =
      cameraRecord != null
        ? {
            position: parseVector3(cameraRecord.position),
            target: parseVector3(cameraRecord.target)
          }
        : null;
    return {
      schemaVersion: GRAPH_UI_SNAPSHOT_VERSION,
      searchTerm: typeof parsed.searchTerm === "string" ? parsed.searchTerm : "",
      focusPersonId: parseNullableString(parsed.focusPersonId),
      pinnedPersonId: parseNullableString(parsed.pinnedPersonId),
      highlightedPersonIds: parseStringArray(parsed.highlightedPersonIds),
      camera: camera?.position && camera.target ? { position: camera.position, target: camera.target } : null
    };
  } catch {
    return DEFAULT_GRAPH_UI_SNAPSHOT;
  }
};

export const parseMapUiSnapshot = (raw: string | null): MapUiSnapshot => {
  if (!raw) {
    return DEFAULT_MAP_UI_SNAPSHOT;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed) || parsed.schemaVersion !== MAP_UI_SNAPSHOT_VERSION) {
      return DEFAULT_MAP_UI_SNAPSHOT;
    }
    return {
      schemaVersion: MAP_UI_SNAPSHOT_VERSION,
      search: typeof parsed.search === "string" ? parsed.search : "",
      minEvents: Math.round(clampNumber(parsed.minEvents, 1, 20, DEFAULT_MAP_UI_SNAPSHOT.minEvents)),
      baseClusterCellDegrees: clampNumber(
        parsed.baseClusterCellDegrees,
        0.2,
        5,
        DEFAULT_MAP_UI_SNAPSHOT.baseClusterCellDegrees
      ),
      center: parseLatLng(parsed.center),
      zoom: clampNumber(parsed.zoom, 1, 18, DEFAULT_MAP_UI_SNAPSHOT.zoom)
    };
  } catch {
    return DEFAULT_MAP_UI_SNAPSHOT;
  }
};
