import { NextRequest } from "next/server";
import { fetchUrlImages } from "@/lib/url-image-fetch";
import { requireUser } from "@/lib/auth-helpers";

/**
 * Fetch images from a URL for use as in-flight prompt references.
 *
 * Unlike the brand-scoped `/api/brands/[slug]/style/url` endpoint, this does
 * NOT save anything to disk — the resulting base64 images flow back to the
 * frontend, get rendered as thumbnails, and are POSTed to `/api/generate`
 * just like uploaded files.
 *
 * Body:  { url: string }
 * 200:   FetchUrlImagesResult — { sourceUrl, images, errors, partial }
 * 400:   invalid URL or zero images extracted
 * 500:   unexpected error
 */
export async function POST(request: NextRequest) {
  const r = await requireUser();
  if (r.error) return r.error;
  try {
    const body = (await request.json()) as { url?: string };
    const url = (body.url ?? "").trim();
    if (!url) {
      return Response.json({ error: "url required" }, { status: 400 });
    }

    const result = await fetchUrlImages(url);
    if (result.images.length === 0) {
      return Response.json(
        {
          error: result.errors[0] ?? "Failed to fetch any images from the URL",
          errors: result.errors,
        },
        { status: 400 }
      );
    }

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
