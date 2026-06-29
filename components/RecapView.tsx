"use client";

import { useMemo, useState } from "react";
import { ENTITY_TABS } from "@/lib/entities";
import { externalUrl, instagramUrl, instagramHandle, googleMapsUrl } from "@/lib/geo";
import type { Recap, RecapItem } from "@/lib/recap";

const labelOf = (t: string) => ENTITY_TABS.find((x) => x.type === t)?.label ?? t;
const emojiOf = (t: string) => ENTITY_TABS.find((x) => x.type === t)?.emoji ?? "";

type SortKey = "rating" | "name" | "category";

export function RecapView({ recap }: { recap: Recap }) {
  const [active, setActive] = useState<RecapItem | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("rating");

  const items = recap.items ?? [];

  // Featured = items with a photo or a blurb, kept in the admin's order.
  const featured = useMemo(
    () => items.filter((i) => (i.photos?.length ?? 0) > 0 || i.blurb),
    [items]
  );

  // Categories present, in the canonical tab order.
  const categories = useMemo(() => {
    const present = new Set(items.map((i) => i.type));
    return ENTITY_TABS.filter((t) => present.has(t.type)).map((t) => t.type);
  }, [items]);

  const list = useMemo(() => {
    let rows = filter === "all" ? items : items.filter((i) => i.type === filter);
    rows = [...rows];
    if (sort === "rating") rows.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    else if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name));
    else rows.sort((a, b) => labelOf(a.type).localeCompare(labelOf(b.type)) || a.name.localeCompare(b.name));
    return rows;
  }, [items, filter, sort]);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {/* Hero */}
      <header className="relative">
        {recap.coverPhotoUrl ? (
          <div className="relative h-64 w-full overflow-hidden sm:h-80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={recap.coverPhotoUrl} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-3xl px-5 pb-5 text-white">
              <h1 className="text-2xl font-bold sm:text-3xl">{recap.title}</h1>
              {recap.subtitle && <p className="mt-1 text-sm text-white/90">{recap.subtitle}</p>}
              {recap.dateLabel && <p className="mt-0.5 text-xs text-white/70">{recap.dateLabel}</p>}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-5 pt-10">
            <h1 className="text-2xl font-bold sm:text-3xl">{recap.title}</h1>
            {recap.subtitle && <p className="mt-1 text-sm text-stone-500">{recap.subtitle}</p>}
            {recap.dateLabel && <p className="mt-0.5 text-xs text-stone-400">{recap.dateLabel}</p>}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        {recap.intro && <p className="mb-8 text-base leading-relaxed text-stone-600">{recap.intro}</p>}

        {/* Featured cards */}
        {featured.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-lg font-semibold">Highlights</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {featured.map((item) => (
                <button
                  key={item.entityId}
                  onClick={() => setActive(item)}
                  className="group overflow-hidden rounded-2xl border border-stone-200 bg-white text-left shadow-sm transition hover:shadow-md"
                >
                  {item.photos?.[0] && (
                    <div className="aspect-[4/3] w-full overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.photos[0]}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-center gap-2">
                      <span>{emojiOf(item.type)}</span>
                      <h3 className="flex-1 font-semibold">{item.name}</h3>
                      {item.rating != null && <Stars rating={item.rating} />}
                    </div>
                    <p className="mt-0.5 text-xs text-stone-400">
                      {labelOf(item.type)}
                      {item.generalArea ? ` · ${item.generalArea}` : ""}
                    </p>
                    {item.blurb && <p className="mt-2 line-clamp-3 text-sm text-stone-600">{item.blurb}</p>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Full recommendations list */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">All recommendations</h2>
            <label className="flex items-center gap-1.5 text-xs text-stone-500">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs outline-none"
              >
                <option value="rating">Rating</option>
                <option value="name">Name</option>
                <option value="category">Category</option>
              </select>
            </label>
          </div>

          {/* Category filter chips */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>
              All ({items.length})
            </Chip>
            {categories.map((c) => (
              <Chip key={c} active={filter === c} onClick={() => setFilter(c)}>
                {emojiOf(c)} {labelOf(c)}
              </Chip>
            ))}
          </div>

          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {list.map((item) => (
              <li key={item.entityId}>
                <button
                  onClick={() => setActive(item)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50"
                >
                  {item.photos?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.photos[0]} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-lg">
                      {emojiOf(item.type)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-stone-400">
                      {labelOf(item.type)}
                      {item.generalArea ? ` · ${item.generalArea}` : ""}
                    </p>
                  </div>
                  {item.rating != null && <Stars rating={item.rating} />}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-12 text-center text-xs text-stone-400">Gooshie Travels</footer>
      </main>

      {active && <DetailModal item={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function DetailModal({ item, onClose }: { item: RecapItem; onClose: () => void }) {
  const mapsHref = googleMapsUrl({ name: item.name, address: item.address, area: item.generalArea });
  const igHref = instagramUrl(item.instagram);
  const webHref = item.website ? externalUrl(item.website) ?? item.website : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {item.photos?.[0] && (
          <div className="aspect-[4/3] w-full overflow-hidden sm:rounded-t-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.photos[0]} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg">{emojiOf(item.type)}</span>
                <h2 className="text-lg font-semibold">{item.name}</h2>
              </div>
              <p className="mt-0.5 text-xs text-stone-400">
                {labelOf(item.type)}
                {item.generalArea ? ` · ${item.generalArea}` : ""}
                {item.area ? ` · ${item.area}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {item.rating != null && <Stars rating={item.rating} />}
              <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
                ✕
              </button>
            </div>
          </div>

          {item.blurb && <p className="mt-3 text-sm leading-relaxed text-stone-600">{item.blurb}</p>}

          {/* Remaining photos */}
          {item.photos && item.photos.length > 1 && (
            <div className="mt-4 grid grid-cols-3 gap-1.5">
              {item.photos.slice(1).map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" className="aspect-square w-full rounded-lg object-cover" />
              ))}
            </div>
          )}

          {/* Picked comments */}
          {item.comments && item.comments.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-stone-100 pt-3">
              {item.comments.map((c, i) => (
                <div key={i} className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">
                  <span className="font-medium text-stone-700">{c.author}: </span>
                  {c.text}
                </div>
              ))}
            </div>
          )}

          {/* Links */}
          {(webHref || igHref || mapsHref) && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-3 text-xs">
              {webHref && (
                <a href={webHref} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:underline">
                  Website ↗
                </a>
              )}
              {igHref && (
                <a href={igHref} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:underline">
                  {instagramHandle(item.instagram)} ↗
                </a>
              )}
              {mapsHref && (
                <a href={mapsHref} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:underline">
                  Google Maps ↗
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
      ★ {rating.toFixed(1)}
    </span>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active ? "bg-stone-900 text-white" : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
      }`}
    >
      {children}
    </button>
  );
}
