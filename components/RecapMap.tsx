"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Marker, Tooltip } from "react-leaflet";
import L, { type LatLngBoundsExpression, type Marker as LeafletMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { resolvePoint, NYC_CENTER, type LatLng } from "@/lib/geo";
import type { EntityType } from "@/lib/entities";
import type { RecapItem, RecapItineraryDay } from "@/lib/recap";

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

// --- The travelling graphic -------------------------------------------------
// Kept as one isolated constant so it's a one-line swap later (plane, person,
// dog…). `rotate` aims the glyph along its heading — turn it off for an upright
// character that would look wrong tilted.
const TRAVELLER = {
  glyph: "🚗",
  size: 46,
  rotate: true,
  /** Emoji car points left at 0°; nudge so "facing right" reads as 0° heading. */
  baseRotation: 180,
  /** Little riders stacked on top of the car; kept upright (they don't rotate). */
  toppers: "🥝✡️",
  topperSize: 20,
};

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

/** One ordered stop on the car's tour, tagged with the day it belongs to. */
type Stop = { pos: LatLng; dayIndex: number; name: string };

/**
 * Flatten the day-by-day itinerary into a single chronological path of stops
 * that resolve to a point. Unresolvable activities are skipped so the line
 * stays continuous; consecutive duplicates (same coords) are collapsed so the
 * car doesn't sit still on a leg of length zero.
 */
function buildRoute(items: RecapItem[], itinerary?: RecapItineraryDay[]): Stop[] {
  if (!itinerary || itinerary.length === 0) return [];
  const byId = new Map(items.map((i) => [i.entityId, i]));
  const stops: Stop[] = [];
  itinerary.forEach((day, di) => {
    for (const act of day.activities) {
      const item = byId.get(act.entityId);
      const point = item ? pointFor(item) : null;
      if (!point) continue;
      const prev = stops[stops.length - 1];
      if (prev && prev.pos.lat === point.pos.lat && prev.pos.lng === point.pos.lng) {
        // Same spot as the previous stop — keep the later day tag, skip the hop.
        prev.dayIndex = di + 1;
        continue;
      }
      stops.push({ pos: point.pos, dayIndex: di + 1, name: act.name });
    }
  });
  return stops;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const headingDeg = (a: LatLng, b: LatLng) =>
  (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * The animated traveller. Gently eases between consecutive stops (slow per-leg
 * ease-in-out with a short dwell at each stop), softly loops back to the start,
 * and reports the day it's currently on so the badge can follow. Movement is
 * driven imperatively on the Leaflet marker for smoothness; React state only
 * changes when the day does.
 */
function Traveller({
  route,
  onDayChange,
}: {
  route: Stop[];
  onDayChange: (day: number) => void;
}) {
  const markerRef = useRef<LeafletMarker | null>(null);

  const icon = useMemo(
    () =>
      L.divIcon({
        className: "recap-traveller",
        html: `<span class="recap-traveller-toppers" style="font-size:${TRAVELLER.topperSize}px;line-height:1">${TRAVELLER.toppers}</span><span class="recap-traveller-glyph" style="font-size:${TRAVELLER.size}px;line-height:1">${TRAVELLER.glyph}</span>`,
        iconSize: [TRAVELLER.size, TRAVELLER.size],
        iconAnchor: [TRAVELLER.size / 2, TRAVELLER.size / 2],
      }),
    []
  );

  useEffect(() => {
    if (route.length < 2) return;
    const marker = markerRef.current;
    if (!marker) return;

    const LEG_MS = 3800; // travel time per hop
    const DWELL_MS = 850; // pause at each stop
    let raf = 0;
    let legStart = performance.now();
    let leg = 0; // animating from route[leg] -> route[leg+1]
    let lastDay = -1;

    const aimGlyph = (deg: number) => {
      const el = marker.getElement()?.querySelector<HTMLElement>(".recap-traveller-glyph");
      if (el && TRAVELLER.rotate) {
        el.style.transform = `rotate(${TRAVELLER.baseRotation - deg}deg)`;
      }
    };

    const announce = (day: number) => {
      if (day !== lastDay) {
        lastDay = day;
        onDayChange(day);
      }
    };

    const tick = (now: number) => {
      const a = route[leg];
      const b = route[(leg + 1) % route.length];
      const elapsed = now - legStart;

      if (elapsed < LEG_MS) {
        const t = easeInOut(Math.min(1, elapsed / LEG_MS));
        marker.setLatLng([
          a.pos.lat + (b.pos.lat - a.pos.lat) * t,
          a.pos.lng + (b.pos.lng - a.pos.lng) * t,
        ]);
        aimGlyph(headingDeg(a.pos, b.pos));
        announce(t < 0.5 ? a.dayIndex : b.dayIndex);
      } else if (elapsed < LEG_MS + DWELL_MS) {
        marker.setLatLng([b.pos.lat, b.pos.lng]);
        announce(b.dayIndex);
      } else {
        leg = (leg + 1) % route.length;
        legStart = now;
      }
      raf = requestAnimationFrame(tick);
    };

    marker.setLatLng([route[0].pos.lat, route[0].pos.lng]);
    announce(route[0].dayIndex);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [route, onDayChange]);

  if (route.length < 2) return null;
  return (
    <Marker
      ref={markerRef}
      position={[route[0].pos.lat, route[0].pos.lng]}
      icon={icon}
      interactive={false}
      keyboard={false}
      zIndexOffset={1000}
    />
  );
}

export default function RecapMap({
  items,
  itinerary,
  onSelect,
}: {
  items: RecapItem[];
  itinerary?: RecapItineraryDay[];
  onSelect: (item: RecapItem) => void;
}) {
  const points = useMemo(() => items.map(pointFor).filter(Boolean) as Point[], [items]);
  const route = useMemo(() => buildRoute(items, itinerary), [items, itinerary]);

  const reduced = useMemo(prefersReducedMotion, []);
  const animate = route.length >= 2 && !reduced;
  const totalDays = itinerary?.length ?? 0;
  const [currentDay, setCurrentDay] = useState(1);

  const bounds = useMemo<LatLngBoundsExpression | undefined>(() => {
    if (points.length < 2) return undefined;
    return points.map((p) => [p.pos.lat, p.pos.lng]) as LatLngBoundsExpression;
  }, [points]);

  if (points.length === 0) return null;

  const center: [number, number] =
    points.length === 1 ? [points[0].pos.lat, points[0].pos.lng] : [NYC_CENTER.lat, NYC_CENTER.lng];

  const routeLine = route.map((s) => [s.pos.lat, s.pos.lng]) as [number, number][];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-stone-200 shadow-sm">
      {route.length >= 2 && totalDays > 1 && (
        <div className="pointer-events-none absolute left-3 top-3 z-[1000]">
          <span
            key={currentDay}
            className="recap-day-badge inline-block rounded-full bg-white/85 px-3 py-1 text-sm font-semibold text-ink shadow-sm backdrop-blur"
          >
            Day {currentDay}
            <span className="text-ink-faint"> / {totalDays}</span>
          </span>
        </div>
      )}
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
        {routeLine.length >= 2 && (
          <Polyline
            positions={routeLine}
            pathOptions={{ color: "#f59e0b", weight: 2, opacity: 0.55, dashArray: "1 8", lineCap: "round" }}
          />
        )}
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
        {animate && <Traveller route={route} onDayChange={setCurrentDay} />}
      </MapContainer>
      <p className="bg-stone-50 px-3 py-2 text-xs text-stone-400">
        {route.length >= 2
          ? "Follow the route in itinerary order. Hover a pin for the place; tap it for details. Some pins are placed by area (approximate)."
          : "Hover a pin for the place; tap it for details. Some pins are placed by area (approximate)."}
      </p>
    </div>
  );
}
