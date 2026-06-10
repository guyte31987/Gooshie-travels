"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  LayersControl,
  LayerGroup as RLLayerGroup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { resolvePoint, NYC_CENTER, type LatLng } from "@/lib/geo";
import { restaurants, vintage } from "@/lib/planning";

type Point = {
  id: string;
  pos: LatLng;
  title: string;
  detail?: string;
  meta?: string;
};

type Layer = {
  name: string;
  color: string;
  points: Point[];
};

type ItineraryEvent = {
  uid: string;
  summary: string;
  location?: string;
  startMs?: number;
};

function useItineraryPoints(): Point[] {
  const [points, setPoints] = useState<Point[]>([]);
  useEffect(() => {
    fetch("/api/itinerary")
      .then((r) => r.json())
      .then((data: { days?: { events: ItineraryEvent[] }[] }) => {
        const pts: Point[] = [];
        for (const day of data.days ?? []) {
          for (const e of day.events) {
            const pos = resolvePoint(e.location, e.uid);
            if (pos) pts.push({ id: e.uid, pos, title: e.summary, detail: e.location });
          }
        }
        setPoints(pts);
      })
      .catch(() => setPoints([]));
  }, []);
  return points;
}

export function TripMap() {
  const itinerary = useItineraryPoints();

  const layers: Layer[] = useMemo(() => {
    const food: Point[] = restaurants
      .map((r) => {
        const pos = resolvePoint(r.area, r.name);
        return pos
          ? { id: "f-" + r.name, pos, title: r.name, detail: r.why, meta: `${r.area} · ${r.price}` }
          : null;
      })
      .filter(Boolean) as Point[];

    const shops: Point[] = vintage
      .map((v) => {
        const pos = resolvePoint(v.address, v.name) ?? resolvePoint(v.area, v.name);
        return pos
          ? { id: "v-" + v.name, pos, title: v.name, detail: v.vibe, meta: v.address }
          : null;
      })
      .filter(Boolean) as Point[];

    return [
      { name: "📅 Scheduled", color: "#4338ca", points: itinerary },
      { name: "🍴 Food", color: "#dc2626", points: food },
      { name: "👕 Vintage", color: "#0891b2", points: shops },
    ];
  }, [itinerary]);

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
            <LayersControl.Overlay key={layer.name} name={layer.name} checked>
              <LayerGroup layer={layer} />
            </LayersControl.Overlay>
          ))}
        </LayersControl>
      </MapContainer>
      <p className="bg-slate-50 px-3 py-2 text-xs text-slate-400">
        Pins are placed by neighborhood (approximate). Toggle layers with the control top-right.
      </p>
    </div>
  );
}

function LayerGroup({ layer }: { layer: Layer }) {
  return (
    <RLLayerGroup>
      {layer.points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.pos.lat, p.pos.lng]}
          radius={7}
          pathOptions={{ color: layer.color, fillColor: layer.color, fillOpacity: 0.85, weight: 1 }}
        >
          <Popup>
            <div className="text-sm">
              <strong>{p.title}</strong>
              {p.meta && <div className="text-xs text-slate-500">{p.meta}</div>}
              {p.detail && <div className="mt-1 text-xs">{p.detail}</div>}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </RLLayerGroup>
  );
}
