import { saveStyleFile, appendStyleUrlRef } from "./brands";
import { fetchUrlImages, urlHash } from "./url-image-fetch";

export interface IngestResult {
  url: string;
  saved_files: string[];
  errors: string[];
  partial: boolean;
}

/**
 * Brand-specific URL ingestion: fetch the URL, save resulting images under
 * `/brands/{slug}/style/`, and record a StyleUrlRef on the brand profile.
 *
 * The fetch/scrape/compress core lives in `./url-image-fetch.ts` and is
 * shared with the per-generation reference flow (`/api/references/url`).
 */
export async function ingestUrl(slug: string, rawUrl: string): Promise<IngestResult> {
  const fetched = await fetchUrlImages(rawUrl);

  if (fetched.images.length === 0) {
    return {
      url: rawUrl,
      saved_files: [],
      errors: fetched.errors.length > 0 ? fetched.errors : ["No images found"],
      partial: false,
    };
  }

  const hash = urlHash(fetched.sourceUrl);
  const saved: string[] = [];
  const errors = [...fetched.errors];

  for (let i = 0; i < fetched.images.length; i++) {
    const img = fetched.images[i];
    try {
      const buffer = Buffer.from(img.base64, "base64");
      const filename = `url-${hash}-${i}.jpg`;
      const finalName = saveStyleFile(slug, filename, buffer);
      saved.push(finalName);
    } catch (e) {
      errors.push(`Failed to save ${img.imageUrl}: ${(e as Error).message}`);
    }
  }

  if (saved.length === 0) {
    return {
      url: rawUrl,
      saved_files: [],
      errors: errors.length > 0 ? errors : ["All image saves failed"],
      partial: false,
    };
  }

  appendStyleUrlRef(slug, {
    url: fetched.sourceUrl,
    fetched_at: new Date().toISOString(),
    cached_files: saved,
  });

  return {
    url: fetched.sourceUrl,
    saved_files: saved,
    errors,
    partial: errors.length > 0,
  };
}
