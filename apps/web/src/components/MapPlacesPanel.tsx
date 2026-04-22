import type { PlacesMapPoint } from "../lib/api";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { latLngBounds } from "leaflet";
import {
  clusterPlaces,
  filterPlaces,
  filterPlacesByBounds,
  getAdaptiveClusterCellDegrees,
  type GeoBounds
} from "./mapPlaces/utils";

type Props = {
  mapUiEnabled: boolean;
  places: PlacesMapPoint[] | null;
  isLoading?: boolean;
  includeLiving: boolean;
  onIncludeLivingChange: (next: boolean) => void;
  onFocusPerson: (personId: string) => void;
  getPersonLabel: (personId: string) => string;
  error?: string | null;
};

const AutoFitBounds = ({
  points,
  fitKey,
  debounceMs = 180
}: {
  points: PlacesMapPoint[];
  fitKey: string;
  debounceMs?: number;
}) => {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) {
      return;
    }
    const timeout = window.setTimeout(() => {
      const bounds = latLngBounds(
        points.map((point) => [point.latitude, point.longitude] as [number, number])
      );
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: points.length > 1 ? 7 : 10 });
    }, debounceMs);
    return () => window.clearTimeout(timeout);
  }, [debounceMs, fitKey, map, points]);
  return null;
};

const MapViewportController = ({
  onZoomChange,
  onBoundsChange
}: {
  onZoomChange: (zoom: number) => void;
  onBoundsChange: (bounds: GeoBounds) => void;
}) => {
  const updateViewport = () => {
    const bounds = map.getBounds();
    onZoomChange(map.getZoom());
    onBoundsChange({
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast()
    });
  };
  const map = useMapEvents({
    zoomend() {
      updateViewport();
    },
    moveend() {
      updateViewport();
    }
  });
  useEffect(() => {
    updateViewport();
  }, [map, onBoundsChange, onZoomChange]);
  return null;
};

export const MapPlacesPanel = ({
  mapUiEnabled,
  places,
  isLoading,
  includeLiving,
  onIncludeLivingChange,
  onFocusPerson,
  getPersonLabel,
  error
}: Props) => {
  const [search, setSearch] = useState("");
  const [minEvents, setMinEvents] = useState(1);
  const [baseClusterCellDegrees, setBaseClusterCellDegrees] = useState(1.2);
  const [mapZoom, setMapZoom] = useState(2);
  const [viewportBounds, setViewportBounds] = useState<GeoBounds | null>(null);

  if (!mapUiEnabled) {
    return (
      <section className="card">
        <h3>Map</h3>
        <p className="hint">Map UI is disabled by server configuration (`MAP_UI_ENABLED`).</p>
      </section>
    );
  }
  if (error) {
    return (
      <section className="card">
        <h3>Map</h3>
        <p className="hint person-names-error">{error}</p>
      </section>
    );
  }
  if (places == null || isLoading) {
    return (
      <section className="card">
        <h3>Map</h3>
        <p className="hint">Loading geocoded places…</p>
      </section>
    );
  }

  const filtered = filterPlaces(places, { search, minEvents });
  const fitPoints = filtered.slice(0, 400);
  const visiblePoints = filterPlacesByBounds(fitPoints, viewportBounds);
  const adaptiveClusterCellDegrees = useMemo(
    () => getAdaptiveClusterCellDegrees(baseClusterCellDegrees, mapZoom),
    [baseClusterCellDegrees, mapZoom]
  );
  const clusters = clusterPlaces(visiblePoints, adaptiveClusterCellDegrees);
  const fitKey = `${search.trim().toLowerCase()}|${minEvents}|${baseClusterCellDegrees}|${includeLiving}|${
    places.length
  }`;
  const center: [number, number] =
    fitPoints.length === 0
      ? [20, 0]
      : [
          fitPoints.reduce((sum, point) => sum + point.latitude, 0) / fitPoints.length,
          fitPoints.reduce((sum, point) => sum + point.longitude, 0) / fitPoints.length
        ];

  return (
    <section className="card map-places-panel">
      <h3>Map</h3>
      <p className="hint">
        Geocoded life-event places ({places.length} total, {filtered.length} filtered, {visiblePoints.length}{" "}
        in view, {clusters.length} clusters).
      </p>
      <div className="map-places-controls">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter place name"
        />
        <label className="graph-search-alt-names">
          <span>Min events: {minEvents}</span>
          <input
            type="range"
            min={1}
            max={20}
            value={minEvents}
            onChange={(event) => setMinEvents(Number(event.target.value))}
          />
        </label>
        <label className="graph-search-alt-names">
          <span>Cluster base radius: {baseClusterCellDegrees.toFixed(1)}°</span>
          <input
            type="range"
            min={0.2}
            max={5}
            step={0.2}
            value={baseClusterCellDegrees}
            onChange={(event) => setBaseClusterCellDegrees(Number(event.target.value))}
          />
        </label>
        <label className="graph-search-alt-names">
          <input
            type="checkbox"
            checked={includeLiving}
            onChange={(event) => onIncludeLivingChange(event.target.checked)}
          />
          Include living people places
        </label>
      </div>
      <MapContainer center={center} zoom={2} scrollWheelZoom className="map-places-canvas">
        <MapViewportController onZoomChange={setMapZoom} onBoundsChange={setViewportBounds} />
        <AutoFitBounds points={fitPoints} fitKey={fitKey} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {clusters.map((cluster) => (
          <CircleMarker
            key={cluster.id}
            center={[cluster.latitude, cluster.longitude]}
            radius={Math.min(20, 4 + Math.log2(cluster.eventCount + 1))}
          >
            <Popup>
              <strong>{cluster.placeNames.slice(0, 3).join(", ")}</strong>
              <br />
              {cluster.eventCount} events across {cluster.placeCount} places, {cluster.personCount} people
              <br />({cluster.latitude.toFixed(3)}, {cluster.longitude.toFixed(3)})
              {cluster.samplePersonIds.length > 0 ? (
                <div className="map-popup-focus-links">
                  {cluster.samplePersonIds.map((personId) => (
                    <button
                      key={personId}
                      type="button"
                      className="text-link-button"
                      onClick={() => onFocusPerson(personId)}
                    >
                      Focus {getPersonLabel(personId)}
                    </button>
                  ))}
                </div>
              ) : null}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <p className="hint map-cluster-hint">
        Adaptive cluster radius: {adaptiveClusterCellDegrees.toFixed(2)}° at zoom {mapZoom.toFixed(1)}.
      </p>
      <ul className="map-places-list">
        {clusters.slice(0, 10).map((cluster) => (
          <li key={cluster.id}>
            <strong>{cluster.placeNames[0]}</strong> ({cluster.latitude.toFixed(3)},{" "}
            {cluster.longitude.toFixed(3)}) · {cluster.eventCount} events
          </li>
        ))}
      </ul>
    </section>
  );
};
