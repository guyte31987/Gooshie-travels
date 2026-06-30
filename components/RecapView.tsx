"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ENTITY_TABS } from "@/lib/entities";
import { externalUrl, instagramUrl, instagramHandle } from "@/lib/geo";
import type { Recap, RecapItem, RecapItineraryDay } from "@/lib/recap";

const RecapMap = dynamic(() => import("./RecapMap"), {
  ssr: false,
  loading: () => <div className="h-[55vh] animate-pulse rounded-2xl bg-ivory-muted" />,
});

// ── Category colours (muted, one per type) ──────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  food: "#C0683A",
  museum: "#7E5A86",
  party: "#A8456A",
  club: "#A8456A",
  bar: "#C0683A",
  hike: "#5E7445",
  spa: "#3F7E80",
  vintage: "#B08A2E",
  sight: "#5A7891",
  attraction: "#5A7891",
  accommodation: "#4338ca",
  show: "#7E5A86",
  event: "#8A8175",
};

// Category types that get the 1+2 asymmetric grid layout
const GRID_TYPES = new Set(["food", "bar", "party", "club"]);

const catColor = (type: string) => CAT_COLOR[type] ?? "#8A8175";
const labelOf = (t: string) => ENTITY_TABS.find((x) => x.type === t)?.label ?? t;

const pics = (i: RecapItem): string[] =>
  (i.publicPhotos?.length ? i.publicPhotos : i.photos) ?? [];

const gradientFor = (type: string) => {
  const c = catColor(type);
  return `linear-gradient(150deg, ${c} 0%, ${c}99 60%, ${c}44 100%)`;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function CategoryDot({ type, size = 8 }: { type: string; size?: number }) {
  return (
    <span
      className="shrink-0 rounded-[3px]"
      style={{ width: size, height: size, background: catColor(type) }}
    />
  );
}

function RatingChip({ rating }: { rating: number }) {
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-0.5 font-display text-[13px] font-semibold text-rust"
      style={{ background: "#f6e9df" }}
    >
      ★ {rating.toFixed(1)}
    </span>
  );
}

// ── Photo/gradient card background ──────────────────────────────────────────

function CardPhoto({
  item,
  height = 140,
  className = "",
}: {
  item: RecapItem;
  height?: number;
  className?: string;
}) {
  const photo = pics(item)[0];
  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={{
        height,
        background: photo ? undefined : gradientFor(item.type),
      }}
    >
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-full w-full object-cover" />
      )}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(33,28,24,.55) 100%)" }}
      />
      {item.generalArea && (
        <span className="absolute bottom-2.5 left-3.5 font-accent text-[13px] italic text-white">
          {item.generalArea}
        </span>
      )}
    </div>
  );
}

// ── Hero band (carousel) ─────────────────────────────────────────────────────

function HeroBand({
  recap,
  mustVisitCount,
  totalCount,
}: {
  recap: Recap;
  mustVisitCount: number;
  totalCount: number;
}) {
  const cover = recap.coverPublicUrl || recap.coverPhotoUrl;

  // Gather all public photos for the carousel: cover first, then item photos
  const allPhotos = useMemo(() => {
    const itemPhotos = (recap.items ?? []).flatMap((i) =>
      (i.publicPhotos?.length ? i.publicPhotos : i.photos) ?? []
    );
    if (cover) {
      return [cover, ...itemPhotos.filter((p) => p !== cover)];
    }
    return itemPhotos;
  }, [recap.items, cover]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (allPhotos.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % allPhotos.length), 4500);
    return () => clearInterval(t);
  }, [allPhotos.length]);

  return (
    <div className="relative min-h-[300px] overflow-hidden sm:min-h-[340px]">
      {/* Carousel photos — fade transition */}
      {allPhotos.length > 0 ? (
        allPhotos.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              opacity: i === idx ? 1 : 0,
              transition: "opacity 1s ease",
              pointerEvents: "none",
            }}
          />
        ))
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(150deg,#c2592f 0%,#d98a4a 55%,#e6c79b 100%)" }}
        />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 25%, rgba(33,28,24,.78) 100%)" }} />

      {/* Content */}
      <div className="relative flex h-full min-h-[300px] flex-col justify-end px-6 pb-6 sm:min-h-[340px]">
        <p className="mb-2 font-mono text-[10px] tracking-[0.12em] text-white/70" style={{ textTransform: "uppercase" }}>
          GOOSHIE TRAVELS
          {recap.dateLabel ? ` · ${recap.dateLabel}` : ""}
        </p>
        <h1
          className="font-display text-[34px] font-semibold leading-none tracking-[-0.01em] text-white sm:text-[38px]"
          style={{ textShadow: "0 2px 16px rgba(0,0,0,.3)" }}
        >
          {recap.title}
        </h1>
        {recap.subtitle && (
          <p className="mt-2 font-accent text-[15px] italic text-white/88">
            {recap.subtitle}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {recap.dateLabel && (
            <span
              className="rounded-full border px-3 py-1 font-sans text-[11px] font-semibold text-white/90"
              style={{ background: "rgba(255,255,255,.15)", borderColor: "rgba(255,255,255,.25)" }}
            >
              {recap.dateLabel}
            </span>
          )}
          <span
            className="rounded-full border px-3 py-1 font-sans text-[11px] font-semibold text-white/90"
            style={{ background: "rgba(255,255,255,.15)", borderColor: "rgba(255,255,255,.25)" }}
          >
            {totalCount} picks
          </span>
          {mustVisitCount > 0 && (
            <span
              className="rounded-full border px-3 py-1 font-sans text-[11px] font-semibold text-white/90"
              style={{ background: "rgba(255,255,255,.15)", borderColor: "rgba(255,255,255,.25)" }}
            >
              ★ {mustVisitCount} must visit
            </span>
          )}

          {/* Carousel dots */}
          {allPhotos.length > 1 && (
            <div className="ml-auto flex gap-1">
              {allPhotos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === idx ? 18 : 6,
                    background: i === idx ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.4)",
                  }}
                  aria-label={`Photo ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Time formatter ───────────────────────────────────────────────────────────

function fmtTime(min: number): string {
  let h = Math.floor(min / 60);
  const m = min % 60;
  const period = h < 12 || h >= 24 ? "am" : "pm";
  h = h % 24;
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return m === 0 ? `${hh}${period}` : `${hh}:${String(m).padStart(2, "0")}${period}`;
}

// ── Itinerary section ────────────────────────────────────────────────────────

function ItinerarySection({
  days,
  itemsByEntityId,
  onSelect,
}: {
  days: RecapItineraryDay[];
  itemsByEntityId: Map<string, RecapItem>;
  onSelect: (i: RecapItem) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const sorted = useMemo(
    () => [...days].sort((a, b) => a.day.localeCompare(b.day)),
    [days]
  );

  // Collect unique category types across all activities, in canonical order
  const categoryTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const day of sorted) for (const act of day.activities) seen.add(act.type);
    return ENTITY_TABS.map((t) => t.type).filter((t) => seen.has(t));
  }, [sorted]);

  const visibleDays = useMemo(() => {
    if (activeFilter === "all") return sorted;
    return sorted
      .map((day) => ({
        ...day,
        activities: day.activities.filter((a) => a.type === activeFilter),
      }))
      .filter((day) => day.activities.length > 0);
  }, [sorted, activeFilter]);

  return (
    <section className="px-5 py-5 sm:px-6">
      {/* Section header */}
      <div className="mb-3 flex items-center gap-2.5">
        <span className="shrink-0 rounded-[3px]" style={{ width: 5, height: 26, background: "#8A8175" }} />
        <h2 className="font-display text-[22px] font-semibold text-ink">Itinerary</h2>
        <span className="font-accent text-[13px] italic text-ink-faint">{sorted.length} days</span>
      </div>

      {/* Category filter pills */}
      {categoryTypes.length > 1 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          <button
            onClick={() => setActiveFilter("all")}
            className="shrink-0 rounded-full px-3 py-1 font-sans text-[12px] font-semibold transition"
            style={{
              background: activeFilter === "all" ? "#211C18" : "#ece7dd",
              color: activeFilter === "all" ? "#fff" : "#6b6256",
            }}
          >
            All
          </button>
          {categoryTypes.map((type) => (
            <button
              key={type}
              onClick={() => setActiveFilter(activeFilter === type ? "all" : type)}
              className="shrink-0 rounded-full px-3 py-1 font-sans text-[12px] font-semibold transition"
              style={{
                background: activeFilter === type ? catColor(type) : "#ece7dd",
                color: activeFilter === type ? "#fff" : "#6b6256",
              }}
            >
              {labelOf(type)}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-5">
        {visibleDays.map((day, di) => {
          const dt = new Date(day.day + "T12:00:00");
          const weekday = dt.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
          const dateStr = dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
          const activities = [...day.activities].sort((a, b) => a.start - b.start);

          // Day index from the full sorted list (not filtered) so "Day 1" stays stable
          const realDayIdx = sorted.findIndex((d) => d.day === day.day);

          return (
            <div key={day.day}>
              {/* Day header */}
              <div className="mb-2.5 flex items-baseline gap-2">
                <span
                  className="shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.1em] text-white"
                  style={{ background: "#211C18", textTransform: "uppercase" }}
                >
                  Day {realDayIdx + 1}
                </span>
                <span className="font-sans text-[13px] font-semibold text-ink">
                  {weekday}, {dateStr}
                </span>
              </div>

              {/* Activity rows */}
              <div className="overflow-hidden rounded-2xl border border-border" style={{ background: "#fff" }}>
                {activities.map((act, ai) => {
                  const recapItem = itemsByEntityId.get(act.entityId);
                  const Wrapper = recapItem ? "button" : "div";
                  return (
                    <Wrapper
                      key={`${act.entityId}-${ai}`}
                      {...(recapItem ? { onClick: () => onSelect(recapItem) } : {})}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[#faf7f2]"
                      style={{ borderTop: ai > 0 ? "1px solid #ece7dd" : undefined }}
                    >
                      {/* Time */}
                      <span className="w-10 shrink-0 text-right font-mono text-[11px] font-semibold text-ink-faint">
                        {fmtTime(act.start)}
                      </span>

                      {/* Connector dot */}
                      <div className="flex shrink-0 flex-col items-center self-stretch">
                        <div className="w-px flex-1" style={{ background: ai === 0 ? "transparent" : "#ece7dd" }} />
                        <span className="my-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: catColor(act.type) }} />
                        <div className="w-px flex-1" style={{ background: ai === activities.length - 1 ? "transparent" : "#ece7dd" }} />
                      </div>

                      {/* Name + category */}
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-[15px] font-semibold leading-tight text-ink">{act.name}</p>
                        <p className="mt-0.5 font-mono text-[10px] tracking-[0.1em]" style={{ textTransform: "uppercase", color: catColor(act.type) }}>
                          {labelOf(act.type)}
                        </p>
                      </div>

                      {/* End time + chevron */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        {act.end > act.start && (
                          <span className="font-mono text-[10px] text-ink-ghost">→ {fmtTime(act.end)}</span>
                        )}
                        {recapItem && (
                          <span className="text-[13px] text-ink-ghost">›</span>
                        )}
                      </div>
                    </Wrapper>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Stats row ────────────────────────────────────────────────────────────────

function StatsRow({
  items,
  mustVisitCount,
}: {
  items: RecapItem[];
  mustVisitCount: number;
}) {
  const rated = items.filter((i) => typeof i.rating === "number");
  const avg = rated.length > 0 ? rated.reduce((s, i) => s + i.rating!, 0) / rated.length : null;

  const stats = [
    { label: "Places", value: String(items.length) },
    { label: "Must visit", value: String(mustVisitCount) },
    ...(avg != null ? [{ label: "Avg rating", value: avg.toFixed(1) }] : []),
  ];

  return (
    <div className="flex border-b border-t border-border-divider">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className="flex flex-1 flex-col items-center py-3 text-center"
          style={{ borderRight: i < stats.length - 1 ? "1px solid #ece7dd" : undefined }}
        >
          <span className="font-display text-[22px] font-semibold text-ink">{s.value}</span>
          <span
            className="mt-0.5 font-mono text-[9px] tracking-[0.12em] text-ink-faint"
            style={{ textTransform: "uppercase" }}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Must-visit reel ──────────────────────────────────────────────────────────

function MustVisitReel({
  items,
  onSelect,
}: {
  items: RecapItem[];
  onSelect: (i: RecapItem) => void;
}) {
  return (
    <section className="pb-8 pt-6">
      <div className="flex items-baseline gap-2.5 px-5 sm:px-6">
        <h2 className="font-display text-[22px] font-semibold text-ink">Must visit</h2>
        <span className="font-accent text-[13px] italic text-ink-faint">non-negotiable</span>
      </div>
      <div className="mt-4 flex gap-3.5 overflow-x-auto px-5 pb-2 sm:px-6" style={{ scrollbarWidth: "none" }}>
        {items.map((item) => (
          <button
            key={item.entityId}
            onClick={() => onSelect(item)}
            className="w-[220px] shrink-0 overflow-hidden rounded-2xl border border-border text-left shadow-sm transition hover:shadow-md"
            style={{ background: "#fff" }}
          >
            {/* Photo / gradient */}
            <div className="relative h-[148px] w-full overflow-hidden" style={{ background: gradientFor(item.type) }}>
              {pics(item)[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pics(item)[0]} alt="" className="h-full w-full object-cover" />
              )}
              <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(33,28,24,.55) 100%)" }} />
              <span
                className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 font-sans text-[10px] font-semibold text-white"
                style={{ background: "rgba(33,28,24,.5)" }}
              >
                ★ Must visit
              </span>
              {item.generalArea && (
                <span className="absolute bottom-2.5 left-3 font-accent text-[12px] italic text-white">
                  {item.generalArea}
                </span>
              )}
            </div>
            <div className="p-3.5">
              <div className="flex items-center gap-1.5">
                <CategoryDot type={item.type} />
                <span
                  className="font-mono text-[10px] tracking-[0.12em]"
                  style={{ textTransform: "uppercase", color: catColor(item.type) }}
                >
                  {labelOf(item.type)}
                </span>
              </div>
              <h3 className="mt-1 font-display text-[17px] font-semibold leading-tight text-ink">
                {item.name}
              </h3>
              {item.generalArea && (
                <p className="mt-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-ghost" style={{ textTransform: "uppercase" }}>
                  {item.generalArea}
                </p>
              )}
              {item.blurb && (
                <p className="mt-2 font-accent text-[12px] italic leading-snug text-ink-secondary line-clamp-2">
                  {item.blurb}
                </p>
              )}
              {item.rating != null && (
                <div className="mt-2.5">
                  <RatingChip rating={item.rating} />
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Category section ─────────────────────────────────────────────────────────

function CategorySection({
  type,
  items,
  wishlistItems = [],
  onSelect,
}: {
  type: string;
  items: RecapItem[];
  wishlistItems?: RecapItem[];
  onSelect: (i: RecapItem) => void;
}) {
  const color = catColor(type);
  const useGrid = GRID_TYPES.has(type);
  const preview = items.slice(0, useGrid ? 3 : 4);
  const rest = items.length - preview.length;

  return (
    <section className="px-5 py-5 sm:px-6">
      {/* Section header */}
      <div className="mb-3.5 flex items-center gap-2.5">
        <span className="shrink-0 rounded-[3px]" style={{ width: 5, height: 26, background: color }} />
        <h2 className="font-display text-[22px] font-semibold text-ink">{labelOf(type)}</h2>
        <span className="font-accent text-[13px] italic text-ink-faint">{items.length} picks</span>
      </div>

      {useGrid ? (
        // 1+2 asymmetric grid
        <div className="flex flex-col gap-2.5">
          {/* Big card */}
          {preview[0] && (
            <button
              onClick={() => onSelect(preview[0])}
              className="overflow-hidden rounded-xl border border-border text-left"
              style={{ background: "#fff" }}
            >
              <CardPhoto item={preview[0]} height={130} />
              <div className="flex items-start justify-between p-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-[16px] font-semibold leading-tight text-ink">
                    {preview[0].name}
                  </h3>
                  {preview[0].blurb && (
                    <p className="mt-1 font-sans text-[11px] leading-snug text-ink-faint line-clamp-2">
                      {preview[0].blurb}
                    </p>
                  )}
                </div>
                {preview[0].rating != null && (
                  <div className="ml-2 shrink-0">
                    <RatingChip rating={preview[0].rating} />
                  </div>
                )}
              </div>
            </button>
          )}
          {/* Two small cards */}
          {preview.length > 1 && (
            <div className="grid grid-cols-2 gap-2.5">
              {preview.slice(1, 3).map((item) => (
                <button
                  key={item.entityId}
                  onClick={() => onSelect(item)}
                  className="overflow-hidden rounded-xl border border-border text-left"
                  style={{ background: "#fff" }}
                >
                  <CardPhoto item={item} height={76} />
                  <div className="p-2.5">
                    <h3 className="font-display text-[13px] font-semibold leading-tight text-ink line-clamp-1">
                      {item.name}
                    </h3>
                    <p className="mt-0.5 font-sans text-[10px] text-ink-faint">
                      {item.generalArea || labelOf(item.type)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        // Horizontal scroll
        <div className="flex gap-2.5 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {preview.map((item) => (
            <button
              key={item.entityId}
              onClick={() => onSelect(item)}
              className="w-[130px] shrink-0 overflow-hidden rounded-xl border border-border text-left"
              style={{ background: "#fff" }}
            >
              <CardPhoto item={item} height={80} />
              <div className="p-2.5">
                <h3 className="font-display text-[13px] font-semibold leading-tight text-ink line-clamp-1">
                  {item.name}
                </h3>
                <p className="mt-0.5 font-sans text-[10px] text-ink-faint">
                  {item.generalArea || labelOf(item.type)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* See all button */}
      {rest > 0 && (
        <p className="mt-3 text-center font-sans text-xs font-semibold text-rust">
          +{rest} more {labelOf(type).toLowerCase()} picks
        </p>
      )}

      {/* "For next visit" wishlist items */}
      {wishlistItems.length > 0 && (
        <div className="mt-5">
          <div className="mb-3 flex items-center gap-2.5">
            <span
              className="h-px flex-1 rounded"
              style={{ background: `${color}33` }}
            />
            <span
              className="rounded-full border px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.1em] text-ink-secondary"
              style={{ textTransform: "uppercase", borderColor: `${color}44`, background: `${color}0a` }}
            >
              For next visit
            </span>
            <span
              className="h-px flex-1 rounded"
              style={{ background: `${color}33` }}
            />
          </div>
          <div className="space-y-1.5">
            {wishlistItems.map((item) => {
              const href = mapsHref(item);
              return (
                <button
                  key={item.entityId}
                  onClick={() => onSelect(item)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                  style={{
                    border: `1.5px dashed ${color}55`,
                    background: `${color}08`,
                    opacity: 0.82,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[14px] font-semibold leading-tight text-ink">
                      {item.name}
                    </p>
                    {item.generalArea && (
                      <p className="mt-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-ghost" style={{ textTransform: "uppercase" }}>
                        {item.generalArea}
                      </p>
                    )}
                    {item.blurb && (
                      <p className="mt-1 font-accent text-[12px] italic leading-snug text-ink-faint line-clamp-1">
                        {item.blurb}
                      </p>
                    )}
                  </div>
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-ink-ghost hover:text-rust"
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
                      </svg>
                    </a>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/** Best available Google Maps URL for an item.
 *  Priority: manually pasted URL → name+coords search → name+address search */
function mapsHref(item: RecapItem): string | null {
  if (item.mapsUrl) return item.mapsUrl;
  if (typeof item.lat === "number" && typeof item.lng === "number") {
    return `https://www.google.com/maps/search/${encodeURIComponent(item.name)}/@${item.lat},${item.lng},17z`;
  }
  if (item.address) {
    return `https://maps.google.com/?q=${encodeURIComponent(`${item.name} ${item.address}`)}`;
  }
  return null;
}

// ── Detail bottom sheet ───────────────────────────────────────────────────────

function DetailSheet({ item, onClose }: { item: RecapItem; onClose: () => void }) {
  const igHref = instagramUrl(item.instagram);
  const webHref = item.website ? externalUrl(item.website) ?? item.website : null;
  const googleMaps = mapsHref(item);
  const photo = pics(item)[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(33,28,24,.5)" }}
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-hidden"
        style={{
          background: "#FBF8F1",
          borderRadius: "26px 26px 0 0",
          boxShadow: "0 -16px 40px -12px rgba(0,0,0,.4)",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <span className="h-1 w-9 rounded-full" style={{ background: "#dcd4c4" }} />
        </div>

        {/* Photo / gradient */}
        <div
          className="relative shrink-0 overflow-hidden"
          style={{
            height: 168,
            background: photo ? undefined : gradientFor(item.type),
          }}
        >
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-full w-full object-cover" />
          )}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to bottom, transparent 50%, rgba(33,28,24,.5) 100%)" }}
          />
          {item.generalArea && (
            <span className="absolute bottom-3 left-4 font-accent text-[13px] italic text-white">
              {item.generalArea}
            </span>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pb-0 pt-4" style={{ minHeight: 0 }}>
          {/* Category + rating + close */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-1.5">
              <CategoryDot type={item.type} size={9} />
              <span
                className="font-mono text-[10px] font-semibold tracking-[0.14em]"
                style={{ textTransform: "uppercase", color: catColor(item.type) }}
              >
                {labelOf(item.type)}
                {item.generalArea ? ` · ${item.generalArea}` : ""}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {item.rating != null && <RatingChip rating={item.rating} />}
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-ink-faint hover:text-ink"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Title */}
          <h2 className="mt-2 font-display text-[26px] font-semibold leading-none text-ink">
            {item.name}
            {item.mustVisit && (
              <span
                className="ml-2 rounded-full px-2 py-0.5 font-sans text-[11px] font-bold text-white"
                style={{ background: "#f59e0b", verticalAlign: "middle" }}
              >
                ★ Must visit
              </span>
            )}
          </h2>

          {/* Blurb */}
          {item.blurb && (
            <p className="mt-2.5 font-accent text-[14px] italic leading-relaxed text-ink-secondary">
              {item.blurb}
            </p>
          )}

          {/* Info rows: HOURS / ADDRESS / LINKS */}
          {(item.hours || item.address || webHref || igHref) && (
            <div className="mt-3.5">
              {item.hours && (
                <div className="flex gap-3 border-t border-border-divider py-1.5">
                  <span
                    className="w-16 shrink-0 pt-0.5 font-mono text-[9px] tracking-[0.1em] text-ink-ghost"
                    style={{ textTransform: "uppercase" }}
                  >
                    Hours
                  </span>
                  <span className="flex-1 font-sans text-[13px] text-ink-body">{item.hours}</span>
                </div>
              )}
              {item.address && (
                <div className="flex gap-3 border-t border-border-divider py-1.5">
                  <span
                    className="w-16 shrink-0 pt-0.5 font-mono text-[9px] tracking-[0.1em] text-ink-ghost"
                    style={{ textTransform: "uppercase" }}
                  >
                    Address
                  </span>
                  <span className="flex-1 font-sans text-[13px] text-ink-body">
                    {item.address}
                    {googleMaps && (
                      <>
                        {" · "}
                        <a href={googleMaps} target="_blank" rel="noreferrer" className="font-semibold text-rust">
                          Maps ↗
                        </a>
                      </>
                    )}
                  </span>
                </div>
              )}
              {(webHref || igHref) && (
                <div className="flex gap-3 border-t border-b border-border-divider py-1.5">
                  <span
                    className="w-16 shrink-0 pt-0.5 font-mono text-[9px] tracking-[0.1em] text-ink-ghost"
                    style={{ textTransform: "uppercase" }}
                  >
                    Links
                  </span>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {webHref && (
                      <a href={webHref} target="_blank" rel="noreferrer" className="font-sans text-[13px] font-semibold text-rust">
                        {item.website?.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗
                      </a>
                    )}
                    {igHref && (
                      <a href={igHref} target="_blank" rel="noreferrer" className="font-sans text-[13px] font-semibold text-rust">
                        {instagramHandle(item.instagram)} ↗
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Additional photos */}
          {pics(item).length > 1 && (
            <div className="mt-4 grid grid-cols-3 gap-1.5">
              {pics(item).slice(1).map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" className="aspect-square w-full rounded-lg object-cover" />
              ))}
            </div>
          )}

          {/* Group comments */}
          {item.comments && item.comments.length > 0 && (
            <div className="mt-4">
              <p
                className="mb-2 font-mono text-[10px] tracking-[0.12em] text-ink-faint"
                style={{ textTransform: "uppercase" }}
              >
                From the group
              </p>
              <div className="space-y-2">
                {item.comments.map((c, i) => (
                  <div
                    key={i}
                    className="flex gap-2 rounded-[10px] p-2.5"
                    style={{ background: "#f3ede1" }}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-sans text-[10px] font-bold text-white"
                      style={{ background: catColor("museum") }}
                    >
                      {(c.author?.[0] ?? "?").toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1 font-sans text-[12px] leading-snug text-ink-secondary">
                      <span className="font-semibold text-ink">{c.author}</span>
                      {" "}{c.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="h-5" />
        </div>

        {/* Footer CTA */}
        <div
          className="flex shrink-0 gap-2.5 border-t border-border-divider px-5 py-3"
          style={{ background: "#FBF8F1" }}
        >
          {webHref && (
            <a
              href={webHref}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-[10px] py-3 text-center font-sans text-[13px] font-semibold text-ink"
              style={{ background: "#efe9dd" }}
            >
              Website ↗
            </a>
          )}
          {googleMaps && (
            <a
              href={googleMaps}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-[10px] py-3 text-center font-sans text-[13px] font-semibold text-white"
              style={{ background: "#211C18" }}
            >
              Maps ›
            </a>
          )}
          {!webHref && !googleMaps && (
            <button
              onClick={onClose}
              className="flex-1 rounded-[10px] py-3 text-center font-sans text-[13px] font-semibold text-ink"
              style={{ background: "#efe9dd" }}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Database section ──────────────────────────────────────────────────────────

function DatabaseSection({
  mustVisit,
  categoryGroups,
  wishlistByType,
  uncoveredWishlist,
  onSelect,
}: {
  mustVisit: RecapItem[];
  categoryGroups: Array<{ type: string; items: RecapItem[] }>;
  wishlistByType: Map<string, RecapItem[]>;
  uncoveredWishlist: RecapItem[];
  onSelect: (i: RecapItem) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<string>("all");

  // All category types that have either visited or wishlist items
  const allTypes = useMemo(() => {
    const visitedTypes = categoryGroups.map((g) => g.type);
    const wishTypes = [...wishlistByType.keys()].filter(
      (t) => !visitedTypes.includes(t)
    );
    return [...visitedTypes, ...wishTypes];
  }, [categoryGroups, wishlistByType]);

  const visibleGroups = useMemo(
    () => (activeFilter === "all" ? categoryGroups : categoryGroups.filter((g) => g.type === activeFilter)),
    [categoryGroups, activeFilter]
  );

  const visibleUncovered = useMemo(() => {
    if (activeFilter === "all") return uncoveredWishlist;
    return uncoveredWishlist.filter((w) => w.type === activeFilter);
  }, [uncoveredWishlist, activeFilter]);

  return (
    <div>
      {/* Section header + pills */}
      <div className="px-5 pb-1 pt-5 sm:px-6">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="shrink-0 rounded-[3px]" style={{ width: 5, height: 26, background: "#8A8175" }} />
          <h2 className="font-display text-[22px] font-semibold text-ink">Places</h2>
          <span className="font-accent text-[13px] italic text-ink-faint">{categoryGroups.reduce((s, g) => s + g.items.length, 0)} picks</span>
        </div>

        {allTypes.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            <button
              onClick={() => setActiveFilter("all")}
              className="shrink-0 rounded-full px-3 py-1 font-sans text-[12px] font-semibold transition"
              style={{
                background: activeFilter === "all" ? "#211C18" : "#ece7dd",
                color: activeFilter === "all" ? "#fff" : "#6b6256",
              }}
            >
              All
            </button>
            {allTypes.map((type) => (
              <button
                key={type}
                onClick={() => setActiveFilter(activeFilter === type ? "all" : type)}
                className="shrink-0 rounded-full px-3 py-1 font-sans text-[12px] font-semibold transition"
                style={{
                  background: activeFilter === type ? catColor(type) : "#ece7dd",
                  color: activeFilter === type ? "#fff" : "#6b6256",
                }}
              >
                {labelOf(type)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Must-visit reel — show when All or if the filter matches any must-visit */}
      {mustVisit.length > 0 && (activeFilter === "all" || mustVisit.some((i) => i.type === activeFilter)) && (
        <MustVisitReel
          items={activeFilter === "all" ? mustVisit : mustVisit.filter((i) => i.type === activeFilter)}
          onSelect={onSelect}
        />
      )}

      {/* Category sections */}
      {visibleGroups.map(({ type, items: catItems }) => (
        <CategorySection
          key={type}
          type={type}
          items={catItems}
          wishlistItems={wishlistByType.get(type) ?? []}
          onSelect={onSelect}
        />
      ))}

      {/* Wishlist-only categories */}
      {(() => {
        const byType = new Map<string, RecapItem[]>();
        for (const w of visibleUncovered) {
          const arr = byType.get(w.type) ?? [];
          arr.push(w);
          byType.set(w.type, arr);
        }
        return [...byType.entries()].map(([type, wItems]) => (
          <CategorySection
            key={`wish-${type}`}
            type={type}
            items={[]}
            wishlistItems={wItems}
            onSelect={onSelect}
          />
        ));
      })()}
    </div>
  );
}

export function RecapView({ recap }: { recap: Recap }) {
  const [active, setActive] = useState<RecapItem | null>(null);

  const items = recap.items ?? [];
  const wishlist = recap.wishlist ?? [];

  const mustVisit = useMemo(() => items.filter((i) => i.mustVisit), [items]);

  const itemsByEntityId = useMemo(
    () => new Map(items.map((i) => [i.entityId, i])),
    [items]
  );

  // Group items by category, preserving canonical ENTITY_TABS order
  const categoryGroups = useMemo(() => {
    const byType = new Map<string, RecapItem[]>();
    for (const item of items) {
      const arr = byType.get(item.type) ?? [];
      arr.push(item);
      byType.set(item.type, arr);
    }
    // Sort: must-visit first within each category
    for (const arr of byType.values()) {
      arr.sort((a, b) => Number(!!b.mustVisit) - Number(!!a.mustVisit) || (b.rating ?? -1) - (a.rating ?? -1));
    }
    // Return in canonical tab order
    const ordered: Array<{ type: string; items: RecapItem[] }> = [];
    for (const tab of ENTITY_TABS) {
      if (byType.has(tab.type)) {
        ordered.push({ type: tab.type, items: byType.get(tab.type)! });
      }
    }
    return ordered;
  }, [items]);

  // Group wishlist items by category type for appending to category sections
  const wishlistByType = useMemo(() => {
    const m = new Map<string, RecapItem[]>();
    for (const w of wishlist) {
      const arr = m.get(w.type) ?? [];
      arr.push(w);
      m.set(w.type, arr);
    }
    return m;
  }, [wishlist]);

  // Wishlist types not covered by any visited category — shown standalone at end
  const uncoveredWishlist = useMemo(
    () => wishlist.filter((w) => !categoryGroups.some((g) => g.type === w.type)),
    [wishlist, categoryGroups]
  );

  return (
    <div className="min-h-screen" style={{ background: "#F7F2E9", fontFamily: "var(--font-sans)" }}>
      {/* Hero carousel */}
      <HeroBand
        recap={recap}
        mustVisitCount={mustVisit.length}
        totalCount={items.length}
      />

      {/* Intro */}
      {recap.intro && (
        <div className="mx-auto max-w-xl px-5 py-5 sm:px-6">
          <p className="font-accent text-[15px] italic leading-relaxed text-ink-secondary">
            {recap.intro}
          </p>
        </div>
      )}

      {/* Stats row */}
      {items.length > 0 && (
        <div className="mx-auto max-w-xl">
          <StatsRow items={items} mustVisitCount={mustVisit.length} />
        </div>
      )}

      <div className="mx-auto max-w-xl">
        {/* Itinerary */}
        {recap.itinerary && recap.itinerary.length > 0 && (
          <ItinerarySection
            days={recap.itinerary}
            itemsByEntityId={itemsByEntityId}
            onSelect={setActive}
          />
        )}

        {/* Database section */}
        <DatabaseSection
          mustVisit={mustVisit}
          categoryGroups={categoryGroups}
          wishlistByType={wishlistByType}
          uncoveredWishlist={uncoveredWishlist}
          onSelect={setActive}
        />

        {/* Map */}
        {items.some((i) => typeof i.lat === "number") && (
          <section className="isolate px-5 pb-8 sm:px-6">
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="font-display text-[22px] font-semibold text-ink">Map</h2>
              <span className="font-accent text-[13px] italic text-ink-faint">{items.length} places</span>
            </div>
            <RecapMap items={items} onSelect={setActive} />
          </section>
        )}

        {/* Footer */}
        <footer
          className="mt-4 px-5 py-8 text-center font-mono text-[10px] tracking-[0.12em] text-ink-ghost sm:px-6"
          style={{ textTransform: "uppercase" }}
        >
          Powered by Gooshie Travels
        </footer>
      </div>

      {active && <DetailSheet item={active} onClose={() => setActive(null)} />}
    </div>
  );
}
