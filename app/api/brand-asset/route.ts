import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { BRANDS_DIR } from "@/lib/paths";
import { requireUser } from "@/lib/auth-helpers";

function safeName(name: string): string | null {
  if (!name || name.includes("/") || name.includes("..") || name.includes("\\")) return null;
  return name;
}

function mimeFor(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".gif") return "image/gif";
  if (e === ".webp") return "image/webp";
  if (e === ".pdf") return "application/pdf";
  if (e === ".svg") return "image/svg+xml";
  return "image/jpeg";
}

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const url = new URL(request.url);
  const slug = safeName(url.searchParams.get("slug") ?? "");
  const file = safeName(url.searchParams.get("file") ?? "");
  const kind = url.searchParams.get("kind") === "style" ? "style" : "guideline";
  if (!slug || !file) return Response.json({ error: "missing params" }, { status: 400 });

  const dir = kind === "style"
    ? path.join(BRANDS_DIR, slug, "style")
    : path.join(BRANDS_DIR, slug);
  const filePath = path.join(dir, file);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const buffer = fs.readFileSync(filePath);
  const arr = new Uint8Array(buffer);
  return new Response(arr, {
    headers: {
      "Content-Type": mimeFor(path.extname(file)),
      "Cache-Control": "private, max-age=60",
    },
  });
}
