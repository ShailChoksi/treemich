/**
 * @file Leaflet map of geocoded life-event places (collapsible popout, filters, living toggle, selection highlight).
 */

import type { PlacesMapPoint } from "../lib/api";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { latLngBounds } from "leaflet";
import {
  clusterPlaces,
  filterPlaces,
  filterPlacesByBounds,
  getAdaptiveClusterCellDegrees,
  placeClusterIncludesImmichPerson,
  type GeoBounds
} from "./mapPlaces/utils";

const clusterMarkerPathOptionsSelected = {
  color: "#166534",
  fillColor: "#22c55e",
  fillOpacity: 0.78,
  weight: 2
} as const;

const clusterMarkerPathOptionsDefault = {
  color: "#1d4ed8",
  fillColor: "#3b82f6",
  fillOpacity: 0.68,
  weight: 2
} as const;

type Props = {
  mapUiEnabled: boolean;
  places: PlacesMapPoint[] | null;
  isLoading?: boolean;
  includeLiving: boolean;
  onIncludeLivingChange: (next: boolean) => void;
  onFocusPerson: (personId: string) => void;
  getPersonLabel: (personId: string) => string;
  /** When set, clusters that include this Immich person id (via map `samplePersonIds`) render green. */
  selectedPersonId?: string | null;
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
  }, [debounceMs, fitKey, map]);
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

/**
 * Sidebar map: OSM tiles, clustered geocoded places, filters, and optional highlight for the selected person.
 */
export const MapPlacesPanel = ({
  mapUiEnabled,
  places,
  isLoading,
  includeLiving,
  onIncludeLivingChange,
  onFocusPerson,
  getPersonLabel,
  selectedPersonId = null,
  error
}: Props) => {
  const [search, setSearch] = useState("");
  const [minEvents, setMinEvents] = useState(1);
  const [baseClusterCellDegrees, setBaseClusterCellDegrees] = useState(1.2);
  const [mapZoom, setMapZoom] = useState(2);
  const [viewportBounds, setViewportBounds] = useState<GeoBounds | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const placesSafe = places ?? [];
  const hasGeocodedPlaces = placesSafe.length > 0;
  const focusPersonId = selectedPersonId?.trim() ? selectedPersonId.trim() : null;
  const canToggleMap = hasGeocodedPlaces || isExpanded || !includeLiving;
  const panelClassName = `card map-places-panel${isExpanded ? " map-places-panel--expanded" : ""}`;
  const filtered = useMemo(
    () => filterPlaces(placesSafe, { search, minEvents }),
    [minEvents, placesSafe, search]
  );
  const fitPoints = useMemo(() => filtered.slice(0, 400), [filtered]);
  const visiblePoints = useMemo(
    () => filterPlacesByBounds(fitPoints, viewportBounds),
    [fitPoints, viewportBounds]
  );
  const adaptiveClusterCellDegrees = useMemo(
    () => getAdaptiveClusterCellDegrees(baseClusterCellDegrees, mapZoom),
    [baseClusterCellDegrees, mapZoom]
  );
  const clusters = useMemo(
    () => clusterPlaces(visiblePoints, adaptiveClusterCellDegrees),
    [adaptiveClusterCellDegrees, visiblePoints]
  );
  const fitKey = `${search.trim().toLowerCase()}|${minEvents}|${baseClusterCellDegrees}|${includeLiving}|${
    placesSafe.length
  }`;
  const center: [number, number] =
    fitPoints.length === 0
      ? [20, 0]
      : [
          fitPoints.reduce((sum, point) => sum + point.latitude, 0) / fitPoints.length,
          fitPoints.reduce((sum, point) => sum + point.longitude, 0) / fitPoints.length
        ];

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

  return (
    <section className={panelClassName}>
      <div className="map-places-header">
        <h3>Map</h3>
        {canToggleMap ? (
          <button
            type="button"
            className="secondary-button map-places-toggle"
            onClick={() => setIsExpanded((value) => !value)}
          >
            {isExpanded ? "Hide map" : "Show map"}
          </button>
        ) : null}
      </div>
      <p className="hint map-places-summary">
        Geocoded life-event places ({placesSafe.length} total, {filtered.length} filtered,{" "}
        {visiblePoints.length} in view, {clusters.length} clusters).
      </p>
      {isExpanded ? (
        <div className="map-places-popout">
          <div className="map-places-controls">
            <input
              className="map-places-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter place name"
            />
            <label className="map-places-control map-places-control--range">
              <span className="map-places-control-label">Min events: {minEvents}</span>
              <input
                className="map-places-range"
                type="range"
                min={1}
                max={20}
                value={minEvents}
                onChange={(event) => setMinEvents(Number(event.target.value))}
              />
            </label>
            <label className="map-places-control map-places-control--range">
              <span className="map-places-control-label">
                Cluster base radius: {baseClusterCellDegrees.toFixed(1)}°
              </span>
              <input
                className="map-places-range"
                type="range"
                min={0.2}
                max={5}
                step={0.2}
                value={baseClusterCellDegrees}
                onChange={(event) => setBaseClusterCellDegrees(Number(event.target.value))}
              />
            </label>
            <label className="map-places-control map-places-control--checkbox">
              <input
                className="map-places-checkbox"
                type="checkbox"
                checked={includeLiving}
                onChange={(event) => onIncludeLivingChange(event.target.checked)}
              />
              Include living people places
            </label>
            {focusPersonId ? (
              <p className="hint map-places-legend">
                Clusters: <span className="map-places-legend-swatch map-places-legend-swatch--selected" />{" "}
                selected person &nbsp;
                <span className="map-places-legend-swatch map-places-legend-swatch--default" /> others (uses
                sample ids from the map feed).
              </p>
            ) : null}
          </div>
          {hasGeocodedPlaces ? (
            <>
              <MapContainer center={center} zoom={2} scrollWheelZoom className="map-places-canvas">
                <MapViewportController onZoomChange={setMapZoom} onBoundsChange={setViewportBounds} />
                <AutoFitBounds points={fitPoints} fitKey={fitKey} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {clusters.map((cluster) => {
                  const includesSelected =
                    focusPersonId != null && placeClusterIncludesImmichPerson(cluster, focusPersonId);
                  const pathOptions = includesSelected
                    ? clusterMarkerPathOptionsSelected
                    : clusterMarkerPathOptionsDefault;
                  return (
                    <CircleMarker
                      key={cluster.id}
                      center={[cluster.latitude, cluster.longitude]}
                      radius={Math.min(20, 4 + Math.log2(cluster.eventCount + 1))}
                      pathOptions={pathOptions}
                    >
                      <Popup>
                        <strong>{cluster.placeNames.slice(0, 3).join(", ")}</strong>
                        <br />
                        {cluster.eventCount} events across {cluster.placeCount} places, {cluster.personCount}{" "}
                        people
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
                  );
                })}
              </MapContainer>
              <p className="hint map-cluster-hint">
                Adaptive cluster radius: {adaptiveClusterCellDegrees.toFixed(2)}° at zoom {mapZoom.toFixed(1)}
                .
              </p>
              {clusters.length > 0 ? (
                <ul className="map-places-list">
                  {clusters.slice(0, 10).map((cluster) => (
                    <li key={cluster.id}>
                      <strong>{cluster.placeNames[0]}</strong> ({cluster.latitude.toFixed(3)},{" "}
                      {cluster.longitude.toFixed(3)}) · {cluster.eventCount} events
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint map-places-empty">No places match the current filters.</p>
              )}
            </>
          ) : (
            <p className="hint map-places-empty">
              {includeLiving
                ? "No geocoded places found yet for this tree."
                : 'No deceased-people places found. Re-enable "Include living people places" to show all geocoded places.'}
            </p>
          )}
        </div>
      ) : (
        <p className="hint map-places-empty">
          {hasGeocodedPlaces
            ? "Map is collapsed to keep profile details visible."
            : "No geocoded places found yet for this tree."}
        </p>
      )}
    </section>
  );
};
