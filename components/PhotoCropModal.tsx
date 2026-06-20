"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { cropImage, compressImage } from "@/lib/imageUtils";

const RATIOS = [
  { label: "Square", value: 1 },
  { label: "Portrait", value: 3 / 4 },
  { label: "Landscape", value: 4 / 3 },
  { label: "Wide", value: 16 / 9 },
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
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<number | undefined>(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedArea(croppedAreaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedArea) return;
    setBusy(true);
    try {
      const cropped = await cropImage(imageSrc, croppedArea, rotation);
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
          rotation={rotation}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className="flex flex-col gap-3 bg-black/80 p-4 text-white">
        {/* Rotate */}
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs text-slate-400">Rotate</span>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-300">{rotation}°</span>
        </div>

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
