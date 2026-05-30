/**
 * Single source of truth for mapping a file extension to an image MIME type.
 * Used by the asset-serving route and by the generation routes that base64-encode
 * images into data URLs. Keeping one mapping avoids drift (e.g. one route emitting
 * image/svg+xml while another silently falls SVG through to image/jpeg).
 */
export function mimeTypeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "image/jpeg";
  }
}
