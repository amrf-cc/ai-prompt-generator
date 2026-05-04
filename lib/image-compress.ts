import sharp from "sharp";

const MAX_DIM = 1536;
const JPEG_QUALITY = 80;

export async function compressImageBase64(
  base64: string
): Promise<{ base64: string; mimeType: string }> {
  const buffer = Buffer.from(base64, "base64");
  const out = await compressImageBuffer(buffer);
  return { base64: out.toString("base64"), mimeType: "image/jpeg" };
}

export async function compressImageBuffer(buffer: Buffer): Promise<Buffer> {
  const img = sharp(buffer);
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const needsResize = w > MAX_DIM || h > MAX_DIM;
  const pipeline = needsResize
    ? img.resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
    : img;
  return pipeline.jpeg({ quality: JPEG_QUALITY }).toBuffer();
}

export function isImageMime(mime: string | undefined | null): boolean {
  if (!mime) return false;
  return mime.startsWith("image/");
}

export function isImageFilename(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|tiff|avif)$/i.test(name);
}
