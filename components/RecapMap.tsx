"use client";

import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { resolvePoint, NYC_CENTER, type LatLng } from "@/lib/geo";
import type { EntityType } from "@/lib/entities";
import type { RecapItem } from "@/lib/recap";

const TYPE_COLOR: Record<string, string> = {
  food: "#dc2626",
  vintage: "#0891b2",
  museum: "#7c3aed",
  club: "#db2777",
  party: "#db2777",
  bar: "#9333ea",
  spa: "#0d9488",
  sight: "#059669",
  attraction: "#ea580c",
  hike: "#65a30d",
  show: "#c026d3",
  event: "#64748b",
  accommodation: "#4338ca",
};
const colorOf = (t: EntityType) => TYPE_COLOR[t] ?? "#a8a29e";

type Point = { item: RecapItem; pos: LatLng };

/** Coordinates for an item: exact when known, else an approximate area centroid. */
function pointFor(item: RecapItem): Point | null {
  if (typeof item.lat === "number" && typeof item.lng === "number") {
    return { item, pos: { lat: item.lat, lng: item.lng } };
  }
  const pos =
    resolvePoint(item.address, item.entityId) ||
    resolvePoint(item.area, item.entityId) ||
    resolvePoint(item.generalArea, item.entityId) ||
    resolvePoint(item.name, item.entityId);
  return pos ? { item, pos } : null;
}

export default function RecapMap({
  items,
  onSelect,
}: {
  items: RecapItem[];
  onSelect: (item: RecapItem) => void;
}) {
  const points = useMemo(() => items.map(pointFor).filter(Boolean) as Point[], [items]);

  const bounds = useMemo<LatLngBoundsExpression | undefined>(() => {
    if (points.length < 2) return undefined;
    return points.map((p) => [p.pos.lat, p.pos.lng]) as LatLngBoundsExpression;
  }, [points]);

  if (points.length === 0) return null;

  const center: [number, number] =
    points.length === 1 ? [points[0].pos.lat, points[0].pos.lng] : [NYC_CENTER.lat, NYC_CENTER.lng];

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 shadow-sm">
      <MapContainer
        center={center}
        bounds={bounds}
        boundsOptions={{ padding: [40, 40] }}
        zoom={points.length === 1 ? 14 : 12}
        scrollWheelZoom={false}
        style={{ height: "55vh", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {points.map((p) => (
          <CircleMarker
            key={p.item.entityId}
            center={[p.pos.lat, p.pos.lng]}
            radius={p.item.mustVisit ? 9 : 7}
            pathOptions={{
              color: p.item.mustVisit ? "#f59e0b" : colorOf(p.item.type),
              fillColor: p.item.mustVisit ? "#fbbf24" : colorOf(p.item.type),
              fillOpacity: 0.9,
              weight: p.item.mustVisit ? 2 : 1,
            }}
            eventHandlers={{ click: () => onSelect(p.item) }}
          >
            <Tooltip direction="top" offset={[0, -4]}>
              <div className="text-xs">
                <strong>{p.item.mustVisit ? "★ " : ""}{p.item.name}</strong>
                {p.item.rating != null && <span className="text-amber-600"> · ★ {p.item.rating.toFixed(1)}</span>}
                {p.item.generalArea && <div className="text-stone-500">{p.item.generalArea}</div>}
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <p className="bg-stone-50 px-3 py-2 text-xs text-stone-400">
        Hover a pin for the place; tap it for details. Some pins are placed by area (approximate).
      </p>
    </div>
  );
}
