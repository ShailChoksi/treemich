/**
 * @file Serializable UI snapshots for workspace remount restore.
 */

export type Vector3Tuple = [number, number, number];
export type LatLngTuple = [number, number];

export type GraphCameraIntent = "manual" | "selectedFocus" | "explicitFocus" | "frameAll" | "topDown";

export type GraphUiSnapshot = {
  schemaVersion: 2;
  searchTerm: string;
  focusPersonId: string | null;
  pinnedPersonId: string | null;
  highlightedPersonIds: string[];
  camera: {
    position: Vector3Tuple;
    target: Vector3Tuple;
  } | null;
  /** Why the camera pose was chosen (orbit samples → manual; keyboard g/f/t → explicitFocus/frameAll/topDown). */
  cameraIntent: GraphCameraIntent;
  /** Optional person context for the camera (does not imply a pending focus command). */
  cameraPersonId: string | null;
};

export type MapUiSnapshot = {
  schemaVersion: 1;
  search: string;
  minEvents: number;
  baseClusterCellDegrees: number;
  center: LatLngTuple | null;
  zoom: number;
};

export const GRAPH_UI_SNAPSHOT_VERSION = 2;

const GRAPH_CAMERA_INTENTS: readonly GraphCameraIntent[] = [
  "manual",
  "selectedFocus",
  "explicitFocus",
  "frameAll",
  "topDown"
] as const;
export const MAP_UI_SNAPSHOT_VERSION = 1;

export const DEFAULT_GRAPH_UI_SNAPSHOT: GraphUiSnapshot = {
  schemaVersion: GRAPH_UI_SNAPSHOT_VERSION,
  searchTerm: "",
  focusPersonId: null,
  pinnedPersonId: null,
  highlightedPersonIds: [],
  camera: null,
  cameraIntent: "frameAll",
  cameraPersonId: null
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

const parseCameraIntent = (value: unknown, hasCamera: boolean): GraphCameraIntent => {
  if (typeof value === "string" && (GRAPH_CAMERA_INTENTS as readonly string[]).includes(value)) {
    return value as GraphCameraIntent;
  }
  return hasCamera ? "manual" : "frameAll";
};

const parseGraphCameraRecord = (
  parsed: Record<string, unknown>
): { position: Vector3Tuple; target: Vector3Tuple } | null => {
  const cameraRecord = isObject(parsed.camera) ? parsed.camera : null;
  const camera =
    cameraRecord != null
      ? {
          position: parseVector3(cameraRecord.position),
          target: parseVector3(cameraRecord.target)
        }
      : null;
  return camera?.position && camera.target ? { position: camera.position, target: camera.target } : null;
};

const parseGraphUiSnapshotV2Fields = (parsed: Record<string, unknown>): GraphUiSnapshot => {
  const camera = parseGraphCameraRecord(parsed);
  return {
    schemaVersion: GRAPH_UI_SNAPSHOT_VERSION,
    searchTerm: typeof parsed.searchTerm === "string" ? parsed.searchTerm : "",
    focusPersonId: parseNullableString(parsed.focusPersonId),
    pinnedPersonId: parseNullableString(parsed.pinnedPersonId),
    highlightedPersonIds: parseStringArray(parsed.highlightedPersonIds),
    camera,
    cameraIntent: parseCameraIntent(parsed.cameraIntent, Boolean(camera)),
    cameraPersonId: parseNullableString(parsed.cameraPersonId)
  };
};

/** v1 had no intent; legacy saved camera is treated as user-driven orbit/pose → manual. */
const migrateGraphUiSnapshotV1ToV2 = (parsed: Record<string, unknown>): GraphUiSnapshot => {
  const camera = parseGraphCameraRecord(parsed);
  const focusPersonId = parseNullableString(parsed.focusPersonId);
  return {
    schemaVersion: GRAPH_UI_SNAPSHOT_VERSION,
    searchTerm: typeof parsed.searchTerm === "string" ? parsed.searchTerm : "",
    focusPersonId,
    pinnedPersonId: parseNullableString(parsed.pinnedPersonId),
    highlightedPersonIds: parseStringArray(parsed.highlightedPersonIds),
    camera,
    cameraIntent: camera ? "manual" : "frameAll",
    cameraPersonId: focusPersonId
  };
};

export const parseGraphUiSnapshot = (raw: string | null): GraphUiSnapshot => {
  if (!raw) {
    return DEFAULT_GRAPH_UI_SNAPSHOT;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) {
      return DEFAULT_GRAPH_UI_SNAPSHOT;
    }
    if (parsed.schemaVersion === GRAPH_UI_SNAPSHOT_VERSION) {
      return parseGraphUiSnapshotV2Fields(parsed);
    }
    if (parsed.schemaVersion === 1) {
      return migrateGraphUiSnapshotV1ToV2(parsed);
    }
    return DEFAULT_GRAPH_UI_SNAPSHOT;
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
