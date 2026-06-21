"use client";

import { useRef, useState } from "react";
import { PhotoCropModal } from "./PhotoCropModal";
import { uploadPhoto, photoPath, type PhotoContext } from "@/lib/storage";
import imageCompression from "browser-image-compression";
import { compressImage } from "@/lib/imageUtils";

const CONCURRENCY = 3;

async function compressAndUpload(file: File, context: PhotoContext, contextId: string): Promise<string> {
  const compressed = await imageCompression(file, {
    maxSizeMB: 1,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
  });
  const path = photoPath(context, contextId);
  return uploadPhoto(path, compressed);
}

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
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    if (files.length === 1) {
      const reader = new FileReader();
      reader.onload = () => setSrcForCrop(reader.result as string);
      reader.readAsDataURL(files[0]);
      return;
    }

    // Batch: upload up to CONCURRENCY files in parallel, track progress
    setUploading(true);
    setError(null);
    setProgress({ done: 0, total: files.length });

    let done = 0;
    const urls: string[] = new Array(files.length);

    try {
      // Process in chunks of CONCURRENCY
      for (let i = 0; i < files.length; i += CONCURRENCY) {
        const chunk = files.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          chunk.map((f) => compressAndUpload(f, context, contextId))
        );
        results.forEach((url, j) => { urls[i + j] = url; });
        done += chunk.length;
        setProgress({ done, total: files.length });
      }
      onUploaded(urls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const handleCropConfirm = async (blob: Blob) => {
    setSrcForCrop(null);
    setUploading(true);
    setError(null);
    try {
      const path = photoPath(context, contextId);
      const url = await uploadPhoto(path, blob);
      onUploaded([url]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
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

      {error && <p className="mt-1 text-[11px] text-rose-500">{error}</p>}

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
