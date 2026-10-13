const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_AVATAR_BYTES = 512 * 1024;

/**
 * Produce the avatar the app stores: WebP, or JPEG where the browser's canvas
 * cannot encode WebP (Safari returns PNG for it). Canvas intentionally takes
 * the first frame of an animated source.
 */
export async function compressAvatar(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Select an image file");
  if (file.size > MAX_INPUT_BYTES) throw new Error("Image must be smaller than 10MB");

  const bitmap = await createImageBitmap(file);
  try {
    const crop = Math.min(bitmap.width, bitmap.height);
    const sourceX = (bitmap.width - crop) / 2;
    const sourceY = (bitmap.height - crop) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image compression failed");
    context.drawImage(bitmap, sourceX, sourceY, crop, crop, 0, 0, 512, 512);

    let output: Blob | null = null;
    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      output = await encode(canvas, "image/webp", quality);
      if (output?.type !== "image/webp") output = await encode(canvas, "image/jpeg", quality);
      if (!output || !["image/webp", "image/jpeg"].includes(output.type)) throw new Error("This browser cannot encode images");
      if (output.size <= MAX_AVATAR_BYTES || quality === 0.52) break;
    }
    if (!output || output.size > MAX_AVATAR_BYTES) throw new Error("Avatar could not be compressed below 512KB");
    return new File([output], output.type === "image/webp" ? "avatar.webp" : "avatar.jpg", { type: output.type });
  } finally {
    bitmap.close();
  }
}

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
