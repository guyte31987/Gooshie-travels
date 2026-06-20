"use client";

import imageCompression from "browser-image-compression";

export type CropArea = { x: number; y: number; width: number; height: number };

/** Crop an image from a data URL using canvas, with optional rotation (degrees). Returns a JPEG Blob. */
export async function cropImage(imageSrc: string, cropArea: CropArea, rotation = 0): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const { naturalWidth: iw, naturalHeight: ih } = image;

  // Build a canvas of the rotated image's bounding box, then extract the crop area.
  const rotRad = (rotation * Math.PI) / 180;
  const bBoxW = Math.abs(Math.cos(rotRad) * iw) + Math.abs(Math.sin(rotRad) * ih);
  const bBoxH = Math.abs(Math.sin(rotRad) * iw) + Math.abs(Math.cos(rotRad) * ih);

  const rotCanvas = document.createElement("canvas");
  rotCanvas.width = bBoxW;
  rotCanvas.height = bBoxH;
  const rotCtx = rotCanvas.getContext("2d")!;
  rotCtx.translate(bBoxW / 2, bBoxH / 2);
  rotCtx.rotate(rotRad);
  rotCtx.drawImage(image, -iw / 2, -ih / 2);

  const canvas = document.createElement("canvas");
  canvas.width = cropArea.width;
  canvas.height = cropArea.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(rotCanvas, cropArea.x, cropArea.y, cropArea.width, cropArea.height, 0, 0, cropArea.width, cropArea.height);

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
