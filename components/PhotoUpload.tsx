"use client";

import { useRef, useState } from "react";
import { PhotoCropModal } from "./PhotoCropModal";
import { uploadPhoto, photoPath, type PhotoContext } from "@/lib/storage";
import { compressImage } from "@/lib/imageUtils";

export function PhotoUpload({
  context,
  contextId,
  onUploaded,
  label = "Add photo",
  className = "",
}: {
  context: PhotoContext;
  contextId: string;
  /** Called with all newly uploaded URLs once the batch is done. */
  onUploaded: (urls: string[]) => void;
  label?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [srcForCrop, setSrcForCrop] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    if (files.length === 1) {
      // Single file → crop modal
      const reader = new FileReader();
      reader.onload = () => setSrcForCrop(reader.result as string);
      reader.readAsDataURL(files[0]);
      return;
    }

    // Multiple files → compress & upload directly (no crop)
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    const urls: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const blob = await compressImage(files[i]);
        const path = photoPath(context, contextId);
        const url = await uploadPhoto(path, blob);
        urls.push(url);
        setProgress({ done: i + 1, total: files.length });
      }
      onUploaded(urls);
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const handleCropConfirm = async (blob: Blob) => {
    setSrcForCrop(null);
    setUploading(true);
    try {
      const path = photoPath(context, contextId);
      const url = await uploadPhoto(path, blob);
      onUploaded([url]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 ${className}`}
      >
        {progress ? `Uploading ${progress.done}/${progress.total}…` : uploading ? "Uploading…" : `📷 ${label}`}
      </button>

      {srcForCrop && (
        <PhotoCropModal
          imageSrc={srcForCrop}
          onConfirm={handleCropConfirm}
          onCancel={() => setSrcForCrop(null)}
        />
      )}
    </>
  );
}
