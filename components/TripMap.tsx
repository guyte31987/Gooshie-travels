"use client";

import { useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  LayersControl,
  LayerGroup as RLLayerGroup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { resolvePoint, NYC_CENTER, externalUrl, instagramUrl, instagramHandle, type LatLng } from "@/lib/geo";
import { ENTITY_TABS, type Entity, type EntityType } from "@/lib/entities";
import { useTripData } from "./TripData";

const TYPE_COLOR: Record<EntityType, string> = {
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
  travel: "#0284c7",
  admin: "#94a3b8",
  uncategorised: "#a8a29e",
};

type Point = { id: string; pos: LatLng; e: Entity };

function pointFor(e: Entity): Point | null {
  // Prefer exact coordinates (from geocoding / Gemini enrichment); otherwise
  // fall back to the approximate neighborhood centroid.
  if (typeof e.lat === "number" && typeof e.lng === "number") {
    return { id: e.id, pos: { lat: e.lat, lng: e.lng }, e };
  }
  const pos = resolvePoint(e.address, e.id) || resolvePoint(e.area, e.id) || resolvePoint(e.name, e.id);
  return pos ? { id: e.id, pos, e } : null;
}

function directionsUrl(e: Entity): string {
  const dest = e.address || `${e.name} ${e.area ?? ""}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

export function TripMap() {
  const { entities } = useTripData();

  const layers = useMemo(() => {
    return ENTITY_TABS.map((tab) => {
      const points = entities
        .filter((e) => e.type === tab.type)
        .map(pointFor)
        .filter(Boolean) as Point[];
      return { type: tab.type, name: `${tab.emoji} ${tab.label}`, color: TYPE_COLOR[tab.type], points };
    }).filter((l) => l.points.length > 0);
  }, [entities]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
      <MapContainer
        center={[NYC_CENTER.lat, NYC_CENTER.lng]}
        zoom={12}
        scrollWheelZoom
        style={{ height: "70vh", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LayersControl position="topright">
          {layers.map((layer) => (
            <LayersControl.Overlay key={layer.type} name={layer.name} checked>
              <RLLayerGroup>
                {layer.points.map((p) => (
                  <CircleMarker
                    key={p.id}
                    center={[p.pos.lat, p.pos.lng]}
                    radius={7}
                    pathOptions={{
                      color: layer.color,
                      fillColor: layer.color,
                      fillOpacity: 0.85,
                      weight: 1,
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <strong>{p.e.name}</strong>
                        {p.e.area && <div className="text-xs text-slate-500">{p.e.area}</div>}
                        {p.e.slots[0] && (
                          <div className="mt-1 text-xs text-emerald-700">{p.e.slots[0].label}</div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-medium">
                          <a
                            href={directionsUrl(p.e)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 underline"
                          >
                            Directions ↗
                          </a>
                          {p.e.website && (
                            <a
                              href={externalUrl(p.e.website)!}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-600 underline"
                            >
                              Website ↗
                            </a>
                          )}
                          {instagramUrl(p.e.instagram) && (
                            <a
                              href={instagramUrl(p.e.instagram)!}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-600 underline"
                            >
                              {instagramHandle(p.e.instagram)} ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </RLLayerGroup>
            </LayersControl.Overlay>
          ))}
        </LayersControl>
      </MapContainer>
      <p className="bg-slate-50 px-3 py-2 text-xs text-slate-400">
        Pins are placed by neighborhood (approximate). Toggle layers top-right; tap a pin for
        directions.
      </p>
    </div>
  );
}
