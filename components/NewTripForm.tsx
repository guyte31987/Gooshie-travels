"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveTrip } from "@/lib/db";

function tripId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `trip-${Date.now()}`;
}

function dateLabel(start: string, end: string): string {
  if (!start || !end) return "";
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const fmtYear = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(start)} – ${fmtYear(end)}`;
}

export function NewTripForm({ onCreated }: { onCreated?: (id: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [areasText, setAreasText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setStartDate("");
    setEndDate("");
    setAreasText("");
    setError(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !startDate || !endDate) return;
    if (endDate < startDate) {
      setError("End date is before the start date.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = tripId(trimmedName);
      const areas = areasText
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      await saveTrip({
        id,
        name: trimmedName,
        dateLabel: dateLabel(startDate, endDate),
        startDate,
        endDate,
        areas,
      });
      reset();
      setOpen(false);
      onCreated?.(id);
      router.push(`/trip/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the trip.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-2xl border border-dashed border-border-card bg-sheet px-5 py-4 text-sm font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
      >
        + New trip
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 space-y-3 rounded-2xl border border-border-card bg-sheet p-5 shadow-sm"
    >
      <h2 className="font-display text-lg font-semibold">New trip</h2>

      <div>
        <label className="text-xs font-medium text-slate-500">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Paris & the Loire"
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
        />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-500">Start date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-500">End date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-500">Areas (comma-separated)</label>
        <input
          type="text"
          value={areasText}
          onChange={(e) => setAreasText(e.target.value)}
          placeholder="Paris, Loire Valley"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400"
        />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-rust px-4 py-2 text-sm font-medium text-white hover:bg-rust/90 disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create trip"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
