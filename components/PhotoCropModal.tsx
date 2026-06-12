"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { cropImage, compressImage } from "@/lib/imageUtils";

const RATIOS = [
  { label: "Free", value: undefined },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
];

export function PhotoCropModal({
  imageSrc,
  onConfirm,
  onCancel,
}: {
  imageSrc: string;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedArea(croppedAreaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedArea) return;
    setBusy(true);
    try {
      const cropped = await cropImage(imageSrc, croppedArea);
      const compressed = await compressImage(cropped);
      onConfirm(compressed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90">
      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className="flex flex-col gap-3 bg-black/80 p-4 text-white">
        {/* Aspect ratio */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Ratio</span>
          {RATIOS.map((r) => (
            <button
              key={r.label}
              onClick={() => setAspect(r.value)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                aspect === r.value ? "bg-white text-black" : "bg-white/10 hover:bg-white/20"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy || !croppedArea}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy ? "Processing…" : "Use this crop"}
          </button>
        </div>
      </div>
    </div>
  );
}
