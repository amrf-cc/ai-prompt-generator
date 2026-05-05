import { NextRequest } from "next/server";
import path from "path";
import { listBrands, createBrand, saveBrandFile, getBrand } from "@/lib/brands";
import { compressImageBuffer, isImageMime } from "@/lib/image-compress";
import { requireUser, isBrandVisibleTo } from "@/lib/auth-helpers";

export async function GET() {
  const r = await requireUser();
  if (r.error) return r.error;
  try {
    const brands = listBrands().filter((b) => isBrandVisibleTo(b, r.user));
    return Response.json(brands);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const r = await requireUser();
  if (r.error) return r.error;
  try {
    const formData = await request.formData();
    const name = formData.get("name") as string;
    const notes = (formData.get("notes") as string) || "";

    if (!name) {
      return Response.json({ error: "Brand name is required" }, { status: 400 });
    }

    const brand = createBrand(name, notes, { owner_email: r.user.email });
    const existing = getBrand(brand.slug);
    const isFresh = !existing || existing.files.length === 0;

    if (existing && !isBrandVisibleTo(existing, r.user)) {
      return Response.json(
        { error: "A brand with that name already exists and isn't yours" },
        { status: 409 }
      );
    }

    const files = formData.getAll("files") as File[];
    for (const file of files) {
      if (!file || file.size === 0) continue;
      const raw = Buffer.from(await file.arrayBuffer());
      if (isImageMime(file.type)) {
        const compressed = await compressImageBuffer(raw);
        const baseName = path.basename(file.name, path.extname(file.name));
        saveBrandFile(brand.slug, `${baseName}.jpg`, compressed);
      } else {
        saveBrandFile(brand.slug, file.name, raw);
      }
    }

    const finalBrand = getBrand(brand.slug) ?? brand;
    return Response.json({ ...finalBrand, _fresh: isFresh });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
