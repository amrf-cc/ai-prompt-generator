import * as cheerio from "cheerio";
import crypto from "crypto";
import { compressImageBuffer } from "./image-compress";

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

export const MAX_IMAGES_PER_URL = 12;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 15_000;

export interface FetchedImage {
  /** base64 of the compressed JPEG (no data: prefix) */
  base64: string;
  /** Always image/jpeg — compressImageBuffer normalizes */
  mimeType: "image/jpeg";
  /** The page or direct-image URL the user pasted (after URL normalization) */
  sourceUrl: string;
  /** The actual image URL we downloaded — may equal sourceUrl for direct images */
  imageUrl: string;
}

export interface FetchUrlImagesResult {
  /** Normalized URL after `new URL(...)` */
  sourceUrl: string;
  images: FetchedImage[];
  errors: string[];
  partial: boolean;
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

export function urlHash(url: string): string {
  return crypto.createHash("sha1").update(url).digest("hex").slice(0, 8);
}

function isPinterestHost(host: string): boolean {
  return /(^|\.)pinterest\.[a-z.]+$/i.test(host);
}

function pinterestKind(u: URL): "pin" | "board" | "other" {
  if (/^\/pin\//i.test(u.pathname)) return "pin";
  // Board URLs look like /<user>/<board>/  (two non-empty segments, neither "pin")
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] !== "pin") return "board";
  return "other";
}

function pickLargestFromSrcset(srcset: string): string | null {
  const candidates = srcset
    .split(",")
    .map((s) => s.trim())
    .map((s) => {
      const [u, w] = s.split(/\s+/);
      const widthNum = w ? parseInt(w.replace(/[wx]$/, ""), 10) : 0;
      return { url: u, width: isFinite(widthNum) ? widthNum : 0 };
    })
    .filter((c) => c.url);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.width - a.width);
  return candidates[0].url;
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function extractImageUrls(
  $: cheerio.CheerioAPI,
  base: URL
): { primary: string[]; fallback: string[] } {
  const host = base.host;

  if (isPinterestHost(host)) {
    const kind = pinterestKind(base);
    if (kind === "pin") {
      const og = $('meta[property="og:image"]').attr("content");
      return { primary: og ? [og] : [], fallback: [] };
    }
    if (kind === "board") {
      const imgs: string[] = [];
      $("img").each((_, el) => {
        const $el = $(el);
        const srcset = $el.attr("srcset");
        if (srcset) {
          const big = pickLargestFromSrcset(srcset);
          if (big) imgs.push(big);
        } else {
          const src = $el.attr("src");
          if (src) imgs.push(src);
        }
      });
      // Pinterest serves several sizes via /236x/, /474x/, /564x/, /736x/, /originals/.
      // Prefer originals/736x when available; map smaller sizes up.
      const upgraded = imgs.map((u) =>
        u.replace(/\/(60x60|75x75|136x136|170x|236x|474x|564x)\//, "/736x/")
      );
      const filtered = upgraded.filter((u) => /pinimg\.com\//.test(u));
      return { primary: dedupe(filtered).slice(0, MAX_IMAGES_PER_URL), fallback: [] };
    }
  }

  // Generic site: prefer og:image / twitter:image, then large <img>.
  const og = $('meta[property="og:image"]').attr("content");
  const tw = $('meta[name="twitter:image"]').attr("content");
  const meta = [og, tw].filter((u): u is string => !!u);

  const imgs: string[] = [];
  $("img").each((_, el) => {
    const $el = $(el);
    const srcset = $el.attr("srcset");
    if (srcset) {
      const big = pickLargestFromSrcset(srcset);
      if (big) imgs.push(big);
      return;
    }
    const src = $el.attr("src");
    if (src) imgs.push(src);
  });

  return { primary: dedupe(meta), fallback: dedupe(imgs).slice(0, MAX_IMAGES_PER_URL) };
}

function resolveUrl(raw: string, base: URL): string | null {
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

/**
 * Reject URLs pointing at private/loopback addresses to prevent SSRF.
 * Single-user local app — basic literal-IP and well-known-name guard
 * (does not perform DNS resolution).
 */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "::") return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 0) return true; // 0.0.0.0
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  return false;
}

/**
 * Fetch one URL and return up to MAX_IMAGES_PER_URL compressed JPEG images.
 * Handles three shapes:
 *   - Pinterest pins  → og:image (1)
 *   - Pinterest boards → many <img> upgraded to /736x/ (up to 12)
 *   - Direct image URLs (Content-Type image/*) → 1
 *   - Generic web pages → og:image / twitter:image first, then <img> fallback
 */
export async function fetchUrlImages(rawUrl: string): Promise<FetchUrlImagesResult> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return { sourceUrl: rawUrl, images: [], errors: ["Invalid URL"], partial: false };
  }
  if (!/^https?:$/.test(target.protocol)) {
    return {
      sourceUrl: rawUrl,
      images: [],
      errors: ["Only http/https URLs are supported"],
      partial: false,
    };
  }
  if (isPrivateHost(target.hostname)) {
    return {
      sourceUrl: rawUrl,
      images: [],
      errors: ["URL points to a private/loopback address"],
      partial: false,
    };
  }

  const errors: string[] = [];

  let initialRes: Response;
  try {
    initialRes = await fetchWithTimeout(target.toString());
  } catch (e) {
    return {
      sourceUrl: target.toString(),
      images: [],
      errors: [`Could not fetch URL: ${(e as Error).message}`],
      partial: false,
    };
  }

  if (!initialRes.ok) {
    return {
      sourceUrl: target.toString(),
      images: [],
      errors: [`HTTP ${initialRes.status} fetching the URL`],
      partial: false,
    };
  }

  const contentType = (initialRes.headers.get("content-type") ?? "").toLowerCase();

  // Direct image URL — body IS the image.
  if (contentType.startsWith("image/")) {
    const lenHeader = initialRes.headers.get("content-length");
    const declaredLen = lenHeader ? parseInt(lenHeader, 10) : NaN;
    if (Number.isFinite(declaredLen) && declaredLen > MAX_IMAGE_BYTES) {
      return {
        sourceUrl: target.toString(),
        images: [],
        errors: [`Image exceeds ${MAX_IMAGE_BYTES} byte limit`],
        partial: false,
      };
    }
    try {
      const arrBuf = await initialRes.arrayBuffer();
      if (arrBuf.byteLength > MAX_IMAGE_BYTES) {
        return {
          sourceUrl: target.toString(),
          images: [],
          errors: [`Image exceeds ${MAX_IMAGE_BYTES} byte limit`],
          partial: false,
        };
      }
      const buffer = Buffer.from(arrBuf);
      const compressed = await compressImageBuffer(buffer);
      return {
        sourceUrl: target.toString(),
        images: [
          {
            base64: compressed.toString("base64"),
            mimeType: "image/jpeg",
            sourceUrl: target.toString(),
            imageUrl: target.toString(),
          },
        ],
        errors: [],
        partial: false,
      };
    } catch (e) {
      return {
        sourceUrl: target.toString(),
        images: [],
        errors: [`Failed to decode image: ${(e as Error).message}`],
        partial: false,
      };
    }
  }

  // HTML page — parse and extract image candidates.
  let html: string;
  try {
    html = await initialRes.text();
  } catch (e) {
    return {
      sourceUrl: target.toString(),
      images: [],
      errors: [`Could not read page body: ${(e as Error).message}`],
      partial: false,
    };
  }

  const $ = cheerio.load(html);
  const { primary, fallback } = extractImageUrls($, target);
  const candidates = (primary.length > 0 ? primary : fallback)
    .map((u) => resolveUrl(u, target))
    .filter((u): u is string => !!u)
    .slice(0, MAX_IMAGES_PER_URL);

  if (candidates.length === 0) {
    return {
      sourceUrl: target.toString(),
      images: [],
      errors: ["No images found on the page"],
      partial: false,
    };
  }

  const images: FetchedImage[] = [];
  for (const imgUrl of candidates) {
    try {
      const res = await fetchWithTimeout(imgUrl, { headers: { Referer: target.toString() } });
      if (!res.ok) {
        errors.push(`HTTP ${res.status} for ${imgUrl}`);
        continue;
      }
      const arrBuf = await res.arrayBuffer();
      if (arrBuf.byteLength > MAX_IMAGE_BYTES) {
        errors.push(`Skipped >${MAX_IMAGE_BYTES} byte image: ${imgUrl}`);
        continue;
      }
      const buffer = Buffer.from(arrBuf);
      const compressed = await compressImageBuffer(buffer);
      images.push({
        base64: compressed.toString("base64"),
        mimeType: "image/jpeg",
        sourceUrl: target.toString(),
        imageUrl: imgUrl,
      });
    } catch (e) {
      errors.push(`Failed ${imgUrl}: ${(e as Error).message}`);
    }
  }

  if (images.length === 0) {
    return {
      sourceUrl: target.toString(),
      images: [],
      errors: errors.length > 0 ? errors : ["All image downloads failed"],
      partial: false,
    };
  }

  return {
    sourceUrl: target.toString(),
    images,
    errors,
    partial: errors.length > 0,
  };
}
