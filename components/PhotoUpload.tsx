"use client";

import { useRef, useState } from "react";
import { PhotoCropModal } from "./PhotoCropModal";
import { uploadPhoto, photoPath, type PhotoContext } from "@/lib/storage";

export function PhotoUpload({
  context,
  contextId,
  onUploaded,
  label = "Add photo",
  className = "",
}: {
  context: PhotoContext;
  contextId: string;
  onUploaded: (url: string) => void;
  label?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [srcForCrop, setSrcForCrop] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSrcForCrop(reader.result as string);
    reader.readAsDataURL(file);
    // Reset so the same file can be re-picked.
    e.target.value = "";
  };

  const handleCropConfirm = async (blob: Blob) => {
    setSrcForCrop(null);
    setUploading(true);
    try {
      const path = photoPath(context, contextId);
      const url = await uploadPhoto(path, blob);
      onUploaded(url);
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
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 ${className}`}
      >
        {uploading ? "Uploading…" : `📷 ${label}`}
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
