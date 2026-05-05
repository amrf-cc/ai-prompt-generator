import { NextRequest } from "next/server";
import path from "path";
import { getBrand, saveStyleFile, deleteStyleFile } from "@/lib/brands";
import { compressImageBuffer, isImageMime } from "@/lib/image-compress";
import {
  requireUser,
  assertCanEditBrand,
  isBrandVisibleTo,
} from "@/lib/auth-helpers";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const r = await requireUser();
  if (r.error) return r.error;
  try {
    const { slug } = await params;
    const brandRecord = getBrand(slug);
    if (!brandRecord) {
      return Response.json({ error: "Brand not found" }, { status: 404 });
    }
    if (!isBrandVisibleTo(brandRecord, r.user)) {
      return Response.json({ error: "Brand not found" }, { status: 404 });
    }
    const block = assertCanEditBrand(slug, r.user, brandRecord);
    if (block) return block;

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const saved: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (!file || file.size === 0) continue;
      if (!isImageMime(file.type)) {
        errors.push(`${file.name}: not an image (type=${file.type})`);
        continue;
      }
      try {
        const raw = Buffer.from(await file.arrayBuffer());
        const compressed = await compressImageBuffer(raw);
        const baseName = path.basename(file.name, path.extname(file.name));
        const finalName = saveStyleFile(slug, `${baseName}.jpg`, compressed);
        saved.push(finalName);
      } catch (e) {
        errors.push(`${file.name}: ${(e as Error).message}`);
      }
    }

    const brand = getBrand(slug);
    return Response.json({ saved, errors, brand });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const r = await requireUser();
  if (r.error) return r.error;
  try {
    const { slug } = await params;
    const brandRecord = getBrand(slug);
    if (!brandRecord) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (!isBrandVisibleTo(brandRecord, r.user)) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const block = assertCanEditBrand(slug, r.user, brandRecord);
    if (block) return block;
    const url = new URL(request.url);
    const file = url.searchParams.get("file");
    if (!file) return Response.json({ error: "file query param required" }, { status: 400 });
    const ok = deleteStyleFile(slug, file);
    if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
    const brand = getBrand(slug);
    return Response.json(brand);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
