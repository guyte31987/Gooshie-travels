"use client";

import { useEffect, useMemo, useState } from "react";
import { ENTITY_TABS, OPERATIONAL_TYPES, type Entity } from "@/lib/entities";
import { activityStatusOf } from "@/lib/itinerary";
import { subscribeEntities, type DBEntity } from "@/lib/db";
import { useTripData } from "./TripData";
import { useAuth } from "./AuthProvider";
import { auth } from "@/lib/firebase";
import {
  fetchPickableComments,
  getRecapByTrip,
  newRecapSlug,
  saveRecapDraft,
  type RecapComment,
  type RecapItem,
  type RecapItineraryDay,
} from "@/lib/recap";

const labelOf = (t: string) => ENTITY_TABS.find((x) => x.type === t)?.label ?? t;
const emojiOf = (t: string) => ENTITY_TABS.find((x) => x.type === t)?.emoji ?? "";

/** Parse a time string like "6:00 PM" → minutes from midnight. */
function parseTimeStr(time?: string): number {
  if (!time) return 0;
  const m = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 0;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
  if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

/** Every photo URL the admin could pick for a place: its favourites + every visit's photos. */
function candidatePhotos(entity: Entity, instancePhotos: string[]): string[] {
  return Array.from(new Set([...(entity.photos ?? []), ...instancePhotos]));
}

export function RecapBuilder({ tripId, tripName, dateLabel }: { tripId: string; tripName: string; dateLabel?: string }) {
  const { entities, instanceMap, slots, instances } = useTripData();
  const { isAdmin, role } = useAuth();
  const canEdit = isAdmin || role === "editor";

  const [slug, setSlug] = useState<string>("");
  const [published, setPublished] = useState(false);
  const [title, setTitle] = useState(tripName);
  const [subtitle, setSubtitle] = useState("");
  const [intro, setIntro] = useState("");
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string>("");
  const [items, setItems] = useState<Map<string, RecapItem>>(new Map());
  const [wishlist, setWishlist] = useState<Map<string, RecapItem>>(new Map());
  const [allEntities, setAllEntities] = useState<DBEntity[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [doneOnly, setDoneOnly] = useState(false);

  // True when any of the entity's visits was marked "done" on the itinerary.
  const isDone = (entity: Entity): boolean =>
    entity.slots.some((s) => s.uid && activityStatusOf(instanceMap.get(s.uid) ?? {}) === "done");

  // Places worth recapping: real place types only, excluding logistics buckets,
  // sorted by the earliest slot so the list follows trip chronological order.
  const places = useMemo(() => {
    const base = entities.filter((e) => !OPERATIONAL_TYPES.has(e.type) && e.type !== "uncategorised");
    const filtered = doneOnly ? base.filter(isDone) : base;

    const earliestKey = (slots: import("@/lib/entities").TripSlot[]): string => {
      let best = "";
      for (const s of slots) {
        const key = s.dayKey ? `${s.dayKey}_${String(s.startMs ?? 0).padStart(15, "0")}` : "";
        if (key && (!best || key < best)) best = key;
      }
      return best || "￿"; // entities with no slots go last
    };

    return [...filtered].sort((a, b) => earliestKey(a.slots).localeCompare(earliestKey(b.slots)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, doneOnly, instanceMap]);

  // Instance photos per entity, derived from its slots' linked PlanInstances.
  const instancePhotosOf = (entity: Entity): string[] =>
    entity.slots.flatMap((s) => (s.uid ? instanceMap.get(s.uid)?.photos ?? [] : []));
  const instanceIdsOf = (entity: Entity): string[] =>
    entity.slots.map((s) => s.uid).filter((x): x is string => !!x);

  // Load an existing draft/published recap once.
  useEffect(() => {
    let alive = true;
    getRecapByTrip(tripId).then((r) => {
      if (!alive) return;
      if (r) {
        setSlug(r.slug);
        setPublished(r.published);
        setTitle(r.title);
        setSubtitle(r.subtitle ?? "");
        setIntro(r.intro ?? "");
        setCoverPhotoUrl(r.coverPhotoUrl ?? "");
        setItems(new Map(r.items.map((it) => [it.entityId, it])));
        setWishlist(new Map((r.wishlist ?? []).map((it) => [it.entityId, it])));
      } else {
        setSlug(newRecapSlug(tripId));
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [tripId]);

  // A fresh recap item from an entity — blurb is pre-filled from the entity's note
  // (editable before publishing); coords carry over for the map.
  const newItem = (e: Entity, mustVisit = false): RecapItem => ({
    entityId: e.id,
    name: e.name,
    type: e.type,
    generalArea: e.generalArea,
    area: e.area,
    lat: e.lat,
    lng: e.lng,
    rating: e.avgRating,
    mustVisit,
    blurb: e.notes ?? "",
    photos: [],
    website: e.website,
    instagram: e.instagram,
    address: e.address,
    hours: e.hours,
    mapsUrl: e.mapsUrl,
  });

  // Overlay the latest entity facts (coords, address, hours, links…) onto a saved
  // item, keeping the admin's edits (blurb, rating, must-visit, photos, comments).
  // This backfills coordinates into recaps built before coords were stored.
  const refreshItem = (item: RecapItem): RecapItem => {
    const e = entities.find((x) => x.id === item.entityId);
    if (!e) return item;
    return {
      ...item,
      name: e.name,
      type: e.type,
      generalArea: e.generalArea,
      area: e.area,
      lat: e.lat,
      lng: e.lng,
      address: e.address,
      website: e.website,
      instagram: e.instagram,
      hours: e.hours,
      mapsUrl: e.mapsUrl,
    };
  };

  const toggle = (e: Entity) => {
    setItems((prev) => {
      const next = new Map(prev);
      if (next.has(e.id)) next.delete(e.id);
      else next.set(e.id, newItem(e));
      return next;
    });
  };

  // Toggle the golden "Must visit" star — auto-includes the place if it wasn't already.
  const toggleStar = (e: Entity) =>
    setItems((prev) => {
      const next = new Map(prev);
      const cur = next.get(e.id);
      if (cur) next.set(e.id, { ...cur, mustVisit: !cur.mustVisit });
      else next.set(e.id, newItem(e, true));
      return next;
    });

  const patch = (id: string, p: Partial<RecapItem>) =>
    setItems((prev) => {
      const cur = prev.get(id);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(id, { ...cur, ...p });
      return next;
    });

  // --- "Places I'd like to visit next" — picked from the whole Database --------
  useEffect(() => subscribeEntities(setAllEntities), []);

  // A wishlist item carries the place's facts (incl. Maps link) but no photos.
  const wishItem = (e: DBEntity): RecapItem => ({
    entityId: e.id,
    name: e.name,
    type: e.type,
    generalArea: e.generalArea,
    area: e.area,
    lat: e.lat,
    lng: e.lng,
    blurb: e.notes ?? "",
    photos: [],
    website: e.website,
    instagram: e.instagram,
    address: e.address,
    hours: e.hours,
    mapsUrl: e.mapsUrl,
  });

  const addWish = (e: DBEntity) =>
    setWishlist((prev) => {
      if (prev.has(e.id)) return prev;
      const next = new Map(prev);
      next.set(e.id, wishItem(e));
      return next;
    });
  const removeWish = (id: string) =>
    setWishlist((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  const patchWish = (id: string, p: Partial<RecapItem>) =>
    setWishlist((prev) => {
      const cur = prev.get(id);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(id, { ...cur, ...p });
      return next;
    });

  const buildItinerary = (): RecapItineraryDay[] => {
    const chosenIds = new Set(items.keys());
    const dayMap = new Map<string, RecapItineraryDay>();

    // Build a lookup from raw Slot id → Slot for end-time enrichment (best-effort).
    const slotById = new Map(slots.map((s) => [s.id, s]));

    for (const entity of entities) {
      if (!chosenIds.has(entity.id)) continue;
      const item = items.get(entity.id);
      if (!item) continue;

      for (const ts of entity.slots) {
        if (!ts.dayKey) continue;

        // ts.uid is the PlanInstance id = "${slotId}__${entityId}"; extract slotId.
        const slotId = ts.uid ? ts.uid.split("__")[0] : undefined;
        const rawSlot = slotId ? slotById.get(slotId) : undefined;
        const startMin = rawSlot?.start ?? parseTimeStr(ts.time);
        const endMin = rawSlot?.end ?? startMin;

        if (!dayMap.has(ts.dayKey)) dayMap.set(ts.dayKey, { day: ts.dayKey, activities: [] });
        const day = dayMap.get(ts.dayKey)!;
        // Avoid duplicate entries (same entity appearing twice in same slot).
        if (!day.activities.some((a) => a.entityId === entity.id && a.start === startMin)) {
          day.activities.push({
            entityId: entity.id,
            name: item.name,
            type: item.type,
            start: startMin,
            end: endMin,
            slotLabel: ts.label,
          });
        }
      }
    }

    return [...dayMap.values()]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((d) => ({ ...d, activities: [...d.activities].sort((a, b) => a.start - b.start) }));
  };

  const draft = () => ({
    slug,
    tripId,
    title: title.trim() || tripName,
    subtitle: subtitle.trim() || undefined,
    dateLabel,
    intro: intro.trim() || undefined,
    coverPhotoUrl: coverPhotoUrl || undefined,
    items: [...items.values()].map(refreshItem),
    wishlist: [...wishlist.values()].map(refreshItem),
    itinerary: buildItinerary(),
    published,
  });

  const saveDraft = async () => {
    setBusy(true);
    setStatus("");
    try {
      await saveRecapDraft(draft());
      setStatus("Draft saved.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const callAction = async (action: "publish" | "unpublish" | "delete") => {
    if (action === "delete" && !confirm("Delete this recap and its public photos? This can't be undone.")) {
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      if (action !== "delete") await saveRecapDraft(draft()); // persist latest edits first
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch("/api/recap/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ slug, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed.");
      if (action === "delete") {
        // Reset to a fresh, empty draft with a new slug.
        setSlug(newRecapSlug(tripId));
        setPublished(false);
        setSubtitle("");
        setIntro("");
        setCoverPhotoUrl("");
        setItems(new Map());
        setWishlist(new Map());
        setStatus("Deleted.");
      } else {
        setPublished(action === "publish");
        setStatus(action === "publish" ? "Published!" : "Unpublished.");
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit) {
    return <p className="py-10 text-center text-sm text-slate-400">Only editors can build a recap.</p>;
  }
  if (!loaded) {
    return <p className="py-10 text-center text-sm text-slate-400">Loading…</p>;
  }

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/r/${slug}` : `/r/${slug}`;

  return (
    <div className="space-y-5">
      {/* Header / publish controls */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Recap page</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              published ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {published ? "Published" : "Draft"}
          </span>
        </div>

        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Subtitle (optional)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            placeholder="Intro — a sentence or two about the trip (optional)"
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={saveDraft}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            onClick={() => callAction("publish")}
            disabled={busy}
            className="rounded-lg bg-rust px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {published ? "Re-publish" : "Publish"}
          </button>
          {published && (
            <button
              onClick={() => callAction("unpublish")}
              disabled={busy}
              className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              Unpublish
            </button>
          )}
          <button
            onClick={() => callAction("delete")}
            disabled={busy}
            className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50 disabled:opacity-50"
          >
            Delete
          </button>
          {status && <span className="text-xs text-slate-500">{status}</span>}
        </div>

        {published && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
            <a href={`/r/${slug}`} target="_blank" rel="noreferrer" className="truncate font-medium text-indigo-600 hover:underline">
              {publicUrl}
            </a>
            <button
              onClick={() => navigator.clipboard?.writeText(publicUrl)}
              className="ml-auto shrink-0 rounded border border-slate-300 px-2 py-0.5 text-slate-600 hover:bg-white"
            >
              Copy
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Tick the places to feature. {items.size} selected. Photos you pick are copied to a public
          gallery when you publish; everything else stays private.
        </p>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
          <input type="checkbox" checked={doneOnly} onChange={(e) => setDoneOnly(e.target.checked)} className="rounded" />
          Done only
        </label>
      </div>

      {/* Place list */}
      <ul className="space-y-2">
        {places.map((e) => {
          const item = items.get(e.id);
          const photos = candidatePhotos(e, instancePhotosOf(e));
          return (
            <li key={e.id} className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center gap-3 px-4 py-3">
                <label className="flex flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={!!item} onChange={() => toggle(e)} className="rounded" />
                  <span>{emojiOf(e.type)}</span>
                  <span className="flex-1 text-sm font-medium">{e.name}</span>
                  <span className="text-[11px] text-slate-400">{labelOf(e.type)}</span>
                  {e.avgRating != null && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      ★ {e.avgRating.toFixed(1)}
                    </span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => toggleStar(e)}
                  title={item?.mustVisit ? "Must visit" : "Mark as Must visit"}
                  className={`shrink-0 text-lg leading-none transition ${
                    item?.mustVisit ? "text-amber-400" : "text-slate-300 hover:text-amber-300"
                  }`}
                >
                  ★
                </button>
              </div>

              {item && (
                <PlaceEditor
                  item={item}
                  photos={photos}
                  coverPhotoUrl={coverPhotoUrl}
                  onSetCover={setCoverPhotoUrl}
                  onPatch={(p) => patch(e.id, p)}
                  fetchComments={() => fetchPickableComments(e.id, instanceIdsOf(e))}
                />
              )}
            </li>
          );
        })}
      </ul>

      {/* Places I'd like to visit next */}
      <WishlistSection
        wishlist={wishlist}
        allEntities={allEntities}
        onAdd={addWish}
        onRemove={removeWish}
        onPatch={patchWish}
      />
    </div>
  );
}

/** Pick places from the whole Database to feature as "I'd like to visit next". */
function WishlistSection({
  wishlist,
  allEntities,
  onAdd,
  onRemove,
  onPatch,
}: {
  wishlist: Map<string, RecapItem>;
  allEntities: DBEntity[];
  onAdd: (e: DBEntity) => void;
  onRemove: (id: string) => void;
  onPatch: (id: string, p: Partial<RecapItem>) => void;
}) {
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return allEntities
      .filter((e) => !OPERATIONAL_TYPES.has(e.type) && e.type !== "uncategorised")
      .filter((e) => !wishlist.has(e.id))
      .filter((e) =>
        [e.name, e.area, e.generalArea, e.address].some((f) => f?.toLowerCase().includes(term))
      )
      .slice(0, 8);
  }, [q, allEntities, wishlist]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold">Places I&apos;d like to visit next</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Search the Database and add places you want to feature for next time.
      </p>

      {/* Search */}
      <div className="relative mt-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search places by name or area…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
            {results.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => { onAdd(e); setQ(""); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span>{emojiOf(e.type)}</span>
                  <span className="flex-1 font-medium">{e.name}</span>
                  <span className="text-[11px] text-slate-400">
                    {e.area || e.generalArea || labelOf(e.type)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Selected wishlist */}
      {wishlist.size > 0 ? (
        <ul className="mt-3 space-y-2">
          {[...wishlist.values()].map((it) => (
            <li key={it.entityId} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <span>{emojiOf(it.type)}</span>
                <span className="flex-1 text-sm font-medium">{it.name}</span>
                <span className="text-[11px] text-slate-400">
                  {it.area || it.generalArea || labelOf(it.type)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(it.entityId)}
                  className="shrink-0 text-slate-300 hover:text-rose-500"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={it.blurb ?? ""}
                onChange={(e) => onPatch(it.entityId, { blurb: e.target.value })}
                placeholder="Why you want to go (optional)…"
                rows={2}
                className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-slate-400"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-slate-400">Nothing added yet.</p>
      )}
    </div>
  );
}

function PlaceEditor({
  item,
  photos,
  coverPhotoUrl,
  onSetCover,
  onPatch,
  fetchComments,
}: {
  item: RecapItem;
  photos: string[];
  coverPhotoUrl: string;
  onSetCover: (url: string) => void;
  onPatch: (p: Partial<RecapItem>) => void;
  fetchComments: () => Promise<RecapComment[]>;
}) {
  const [available, setAvailable] = useState<RecapComment[] | null>(null);
  const [urlInput, setUrlInput] = useState("");

  useEffect(() => {
    fetchComments().then(setAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addPhotoUrl = () => {
    const url = urlInput.trim();
    if (!url || item.photos.includes(url)) { setUrlInput(""); return; }
    onPatch({ photos: [...item.photos, url] });
    setUrlInput("");
  };

  const togglePhoto = (url: string) => {
    const has = item.photos.includes(url);
    onPatch({ photos: has ? item.photos.filter((p) => p !== url) : [...item.photos, url] });
  };

  const toggleComment = (c: RecapComment) => {
    const cur = item.comments ?? [];
    const has = cur.some((x) => x.author === c.author && x.text === c.text);
    onPatch({ comments: has ? cur.filter((x) => !(x.author === c.author && x.text === c.text)) : [...cur, c] });
  };

  return (
    <div className="space-y-3 border-t border-slate-100 px-4 py-3">
      {/* Rating + blurb */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rating</span>
        <input
          type="number"
          min={0}
          max={10}
          step={0.1}
          value={item.rating ?? ""}
          onChange={(e) => onPatch({ rating: e.target.value === "" ? undefined : Number(e.target.value) })}
          placeholder="0–10"
          className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-400"
        />
      </div>
      <textarea
        value={item.blurb ?? ""}
        onChange={(e) => onPatch({ blurb: e.target.value })}
        placeholder="Your recommendation — why it's worth it…"
        rows={2}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
      />

      {/* Photo picker */}
      {photos.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Photos ({item.photos.length} chosen)
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {photos.map((url) => {
              const chosen = item.photos.includes(url);
              const isCover = coverPhotoUrl === url;
              return (
                <div key={url} className="relative">
                  <button
                    type="button"
                    onClick={() => togglePhoto(url)}
                    className={`block aspect-square w-full overflow-hidden rounded-lg border-2 ${
                      chosen ? "border-indigo-500" : "border-transparent"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                  {chosen && (
                    <button
                      type="button"
                      onClick={() => onSetCover(isCover ? "" : url)}
                      className={`absolute bottom-1 right-1 rounded px-1 py-0.5 text-[9px] font-semibold ${
                        isCover ? "bg-amber-400 text-white" : "bg-black/50 text-white"
                      }`}
                    >
                      {isCover ? "★ cover" : "cover"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">No photos for this place yet.</p>
      )}

      {/* Add photo from external URL */}
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Add photo from URL
        </p>
        <div className="flex gap-1.5">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPhotoUrl()}
            placeholder="https://…"
            className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-400"
          />
          <button
            type="button"
            onClick={addPhotoUrl}
            disabled={!urlInput.trim()}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {/* Comment picker */}
      {available === null ? (
        <p className="text-xs text-slate-400">Loading comments…</p>
      ) : available.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Comments ({(item.comments ?? []).length} chosen)
          </p>
          <ul className="space-y-1.5">
            {available.map((c, i) => {
              const chosen = (item.comments ?? []).some((x) => x.author === c.author && x.text === c.text);
              return (
                <li key={i}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs">
                    <input type="checkbox" checked={chosen} onChange={() => toggleComment(c)} className="mt-0.5 rounded" />
                    <span className="text-slate-600">
                      <span className="font-medium text-slate-700">{c.author}: </span>
                      {c.text}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
