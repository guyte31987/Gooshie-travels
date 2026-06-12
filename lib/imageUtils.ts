"use client";

import imageCompression from "browser-image-compression";

export type CropArea = { x: number; y: number; width: number; height: number };

/** Crop an image from a data URL using canvas, returns a JPEG Blob. */
export async function cropImage(imageSrc: string, cropArea: CropArea): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = cropArea.width;
  canvas.height = cropArea.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, cropArea.x, cropArea.y, cropArea.width, cropArea.height, 0, 0, cropArea.width, cropArea.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))), "image/jpeg", 0.92);
  });
}

/** Compress a Blob to max 1 MB, max 1600px on longest side. */
export async function compressImage(blob: Blob): Promise<Blob> {
  const file = new File([blob], "photo.jpg", { type: "image/jpeg" });
  const compressed = await imageCompression(file, {
    maxSizeMB: 1,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: "image/jpeg",
  });
  return compressed;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
