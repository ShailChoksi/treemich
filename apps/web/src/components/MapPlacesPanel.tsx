import type { PlacesMapPoint } from "../lib/api";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { latLngBounds } from "leaflet";
import { clusterPlaces, filterPlaces, type PlaceCluster } from "./mapPlaces/utils";

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

const AutoFitBounds = ({ clusters }: { clusters: PlaceCluster[] }) => {
  const map = useMap();
  const signature = useMemo(
    () => clusters.map((cluster) => `${cluster.id}:${cluster.latitude}:${cluster.longitude}`).join("|"),
    [clusters]
  );
  useEffect(() => {
    if (signature.length === 0) {
      return;
    }
    const bounds = latLngBounds(
      clusters.map((cluster) => [cluster.latitude, cluster.longitude] as [number, number])
    );
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: clusters.length > 1 ? 7 : 10 });
  }, [clusters, map, signature]);
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
  const [clusterCellDegrees, setClusterCellDegrees] = useState(1.2);

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
  const top = filtered.slice(0, 400);
  const clusters = clusterPlaces(top, clusterCellDegrees);
  const center: [number, number] =
    clusters.length === 0
      ? [20, 0]
      : [
          clusters.reduce((sum, cluster) => sum + cluster.latitude, 0) / clusters.length,
          clusters.reduce((sum, cluster) => sum + cluster.longitude, 0) / clusters.length
        ];

  return (
    <section className="card map-places-panel">
      <h3>Map</h3>
      <p className="hint">
        Geocoded life-event places ({places.length} total, {filtered.length} visible, {clusters.length}{" "}
        clusters).
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
          <span>Cluster radius: {clusterCellDegrees.toFixed(1)}°</span>
          <input
            type="range"
            min={0.2}
            max={5}
            step={0.2}
            value={clusterCellDegrees}
            onChange={(event) => setClusterCellDegrees(Number(event.target.value))}
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
        <AutoFitBounds clusters={clusters} />
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
