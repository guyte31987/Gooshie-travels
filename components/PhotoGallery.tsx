"use client";

import { useState } from "react";
import { PhotoUpload } from "./PhotoUpload";
import { deletePhoto } from "@/lib/storage";
import type { PhotoContext } from "@/lib/storage";

export function PhotoGallery({
  photos,
  context,
  contextId,
  canEdit,
  onPhotosChange,
}: {
  photos: string[];
  context: PhotoContext;
  contextId: string;
  canEdit: boolean;
  /** Called with the new full photos array after any add/remove. */
  onPhotosChange: (photos: string[]) => Promise<void>;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleUploaded = async (url: string) => {
    await onPhotosChange([...photos, url]);
  };

  const handleDelete = async (url: string) => {
    setDeleting(url);
    try {
      await deletePhoto(url);
      await onPhotosChange(photos.filter((p) => p !== url));
    } finally {
      setDeleting(null);
    }
  };

  if (!canEdit && photos.length === 0) return null;

  return (
    <div>
      {photos.length > 0 && (
        <div className="mb-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {photos.map((url) => (
            <div key={url} className="group relative aspect-square">
              <img
                src={url}
                alt=""
                className="h-full w-full cursor-pointer rounded-lg object-cover"
                onClick={() => setLightbox(url)}
              />
              {canEdit && (
                <button
                  onClick={() => handleDelete(url)}
                  disabled={deleting === url}
                  className="absolute right-1 top-1 hidden rounded-full bg-black/60 p-0.5 text-[10px] text-white hover:bg-red-600 group-hover:flex"
                  title="Delete photo"
                >
                  {deleting === url ? "…" : "✕"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <PhotoUpload
          context={context}
          contextId={contextId}
          onUploaded={handleUploaded}
          label={photos.length === 0 ? "Add photo" : "Add another"}
        />
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 text-2xl text-white/70 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
