import { NextRequest } from "next/server";
import { isBrandVisibleTo, requireUser } from "@/lib/auth-helpers";
import { getBrand } from "@/lib/brands";
import { getProductFile } from "@/lib/products";
import { mimeTypeForExt } from "@/lib/mime";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const brandSlug = url.searchParams.get("brand");
  const file = url.searchParams.get("file");

  if (!brandSlug) return Response.json({ error: "missing brand" }, { status: 400 });
  if (!file || file.includes("/") || file.includes("..") || file.includes("\\")) {
    return Response.json({ error: "missing or invalid file" }, { status: 400 });
  }

  const brand = getBrand(brandSlug);
  if (!brand) return Response.json({ error: "brand not found" }, { status: 404 });
  if (!isBrandVisibleTo(brand, auth.user)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const result = getProductFile(brandSlug, file);
  if (!result) return Response.json({ error: "not found" }, { status: 404 });

  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": mimeTypeForExt(result.ext),
      "Cache-Control": "private, max-age=300",
    },
  });
}
