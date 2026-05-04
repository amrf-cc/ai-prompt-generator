import fs from "fs";
import path from "path";
import type { BrandProfile, StyleUrlRef } from "./types";
import { BRANDS_DIR } from "./paths";

const STYLE_SUBDIR = "style";

function ensureBrandsDir() {
  if (!fs.existsSync(BRANDS_DIR)) {
    fs.mkdirSync(BRANDS_DIR, { recursive: true });
  }
}

function brandDirPath(slug: string): string {
  return path.join(BRANDS_DIR, slug);
}

function styleDirPath(slug: string): string {
  return path.join(BRANDS_DIR, slug, STYLE_SUBDIR);
}

function readMetadataRaw(slug: string): Record<string, unknown> | null {
  const metaPath = path.join(brandDirPath(slug), "metadata.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  } catch {
    return null;
  }
}

function listTopLevelFiles(slug: string): string[] {
  const dir = brandDirPath(slug);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name !== "metadata.json")
    .map((d) => d.name);
}

function listStyleFiles(slug: string): string[] {
  const dir = styleDirPath(slug);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name);
}

function buildBrandFromMeta(
  meta: Record<string, unknown>,
  slug: string
): BrandProfile {
  return {
    name: String(meta.name ?? ""),
    slug,
    created_at: String(meta.created_at ?? ""),
    notes: typeof meta.notes === "string" ? meta.notes : "",
    files: listTopLevelFiles(slug),
    style_files: listStyleFiles(slug),
    style_urls: (meta.style_urls as StyleUrlRef[] | undefined) ?? [],
    voice: meta.voice as BrandProfile["voice"],
    visual: meta.visual as BrandProfile["visual"],
    legal: meta.legal as BrandProfile["legal"],
  };
}

export function listBrands(): BrandProfile[] {
  ensureBrandsDir();
  const entries = fs.readdirSync(BRANDS_DIR, { withFileTypes: true });
  const brands: BrandProfile[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = readMetadataRaw(entry.name);
    if (!meta) continue;
    brands.push(buildBrandFromMeta(meta, entry.name));
  }

  return brands;
}

export function getBrand(slug: string): BrandProfile | null {
  const meta = readMetadataRaw(slug);
  if (!meta) return null;
  return buildBrandFromMeta(meta, slug);
}

export function createBrand(name: string, notes: string): BrandProfile {
  ensureBrandsDir();
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const brandDir = brandDirPath(slug);

  if (!fs.existsSync(brandDir)) {
    fs.mkdirSync(brandDir, { recursive: true });
  }

  const existing = readMetadataRaw(slug);
  if (existing) {
    return buildBrandFromMeta(existing, slug);
  }

  const metadata = {
    name,
    slug,
    created_at: new Date().toISOString(),
    notes,
  };

  fs.writeFileSync(
    path.join(brandDir, "metadata.json"),
    JSON.stringify(metadata, null, 2)
  );

  return buildBrandFromMeta(metadata, slug);
}

export function saveBrandFile(
  slug: string,
  filename: string,
  buffer: Buffer
): void {
  const brandDir = brandDirPath(slug);
  if (!fs.existsSync(brandDir)) {
    fs.mkdirSync(brandDir, { recursive: true });
  }
  fs.writeFileSync(path.join(brandDir, filename), buffer);
}

export function saveStyleFile(
  slug: string,
  filename: string,
  buffer: Buffer
): string {
  const dir = styleDirPath(slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const safeName = uniqueFilename(dir, filename);
  fs.writeFileSync(path.join(dir, safeName), buffer);
  return safeName;
}

export function deleteStyleFile(slug: string, filename: string): boolean {
  const filePath = path.join(styleDirPath(slug), filename);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  // Drop reference from style_urls cache lists too.
  const meta = readMetadataRaw(slug) ?? {};
  const urls = (meta.style_urls as StyleUrlRef[] | undefined) ?? [];
  const cleaned = urls
    .map((u) => ({
      ...u,
      cached_files: u.cached_files.filter((f) => f !== filename),
    }))
    .filter((u) => u.cached_files.length > 0);
  if (cleaned.length !== urls.length || cleaned.some((u, i) => u.cached_files.length !== urls[i].cached_files.length)) {
    updateBrandMetadata(slug, { style_urls: cleaned });
  }
  return true;
}

export function deleteBrandFile(slug: string, filename: string): boolean {
  if (filename === "metadata.json" || filename.includes("/") || filename.includes("..")) {
    return false;
  }
  const filePath = path.join(brandDirPath(slug), filename);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  fs.unlinkSync(filePath);
  return true;
}

export function updateBrandMetadata(
  slug: string,
  patch: Partial<{
    notes: string;
    voice: BrandProfile["voice"];
    visual: BrandProfile["visual"];
    legal: BrandProfile["legal"];
    style_urls: StyleUrlRef[];
  }>
): BrandProfile | null {
  const meta = readMetadataRaw(slug);
  if (!meta) return null;
  const merged: Record<string, unknown> = { ...meta };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    merged[k] = v;
  }
  fs.writeFileSync(
    path.join(brandDirPath(slug), "metadata.json"),
    JSON.stringify(merged, null, 2)
  );
  return buildBrandFromMeta(merged, slug);
}

function uniqueFilename(dir: string, name: string): string {
  if (!fs.existsSync(path.join(dir, name))) return name;
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let i = 1;
  while (fs.existsSync(path.join(dir, `${base}-${i}${ext}`))) i++;
  return `${base}-${i}${ext}`;
}

export function appendStyleUrlRef(slug: string, ref: StyleUrlRef): void {
  const meta = readMetadataRaw(slug) ?? {};
  const existing = (meta.style_urls as StyleUrlRef[] | undefined) ?? [];
  updateBrandMetadata(slug, { style_urls: [...existing, ref] });
}

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".gif") return "image/gif";
  if (e === ".webp") return "image/webp";
  return "image/jpeg";
}

function isImageExt(ext: string): boolean {
  return [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext.toLowerCase());
}

async function extractPdfText(filePath: string, label: string): Promise<string> {
  let parser: { destroy: () => Promise<void> } | undefined;
  try {
    const mod = await import("pdf-parse");
    const PDFParse = mod.PDFParse;
    const buffer = fs.readFileSync(filePath);
    parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await (parser as InstanceType<typeof PDFParse>).getText();
    return `\n--- Content from ${label} ---\n${result.text}\n`;
  } catch (err) {
    console.error(`pdf-parse failed for ${label}:`, err);
    return `\n--- Could not parse ${label} ---\n`;
  } finally {
    if (parser) await parser.destroy().catch(() => {});
  }
}

export interface BrandContext {
  notes: string;
  textContent: string;
  imageFiles: { name: string; base64: string; mimeType: string }[];
  styleImages: { name: string; base64: string; mimeType: string }[];
  voice?: BrandProfile["voice"];
  visual?: BrandProfile["visual"];
  legal?: BrandProfile["legal"];
}

export async function getBrandContext(slug: string): Promise<BrandContext> {
  const brand = getBrand(slug);
  if (!brand) {
    return { notes: "", imageFiles: [], textContent: "", styleImages: [] };
  }

  const brandDir = brandDirPath(slug);
  const imageFiles: BrandContext["imageFiles"] = [];
  let textContent = "";

  for (const file of brand.files) {
    const filePath = path.join(brandDir, file);
    const ext = path.extname(file).toLowerCase();
    if (isImageExt(ext)) {
      const buffer = fs.readFileSync(filePath);
      imageFiles.push({
        name: file,
        base64: buffer.toString("base64"),
        mimeType: mimeFromExt(ext),
      });
    } else if (ext === ".pdf") {
      textContent += await extractPdfText(filePath, file);
    } else if ([".txt", ".md", ".json"].includes(ext)) {
      textContent += `\n--- Content from ${file} ---\n${fs.readFileSync(filePath, "utf-8")}\n`;
    }
  }

  const styleImages: BrandContext["styleImages"] = [];
  for (const file of brand.style_files ?? []) {
    const ext = path.extname(file).toLowerCase();
    if (!isImageExt(ext)) continue;
    const buffer = fs.readFileSync(path.join(styleDirPath(slug), file));
    styleImages.push({
      name: file,
      base64: buffer.toString("base64"),
      mimeType: mimeFromExt(ext),
    });
  }

  return {
    notes: brand.notes,
    textContent,
    imageFiles,
    styleImages,
    voice: brand.voice,
    visual: brand.visual,
    legal: brand.legal,
  };
}

export async function getBrandPdfText(slug: string): Promise<string> {
  const brand = getBrand(slug);
  if (!brand) return "";
  const brandDir = brandDirPath(slug);
  let out = "";
  for (const file of brand.files) {
    const ext = path.extname(file).toLowerCase();
    if (ext === ".pdf") {
      out += await extractPdfText(path.join(brandDir, file), file);
    } else if ([".txt", ".md", ".json"].includes(ext)) {
      out += `\n--- Content from ${file} ---\n${fs.readFileSync(path.join(brandDir, file), "utf-8")}\n`;
    }
  }
  return out;
}

export function getStyleImagesAsBase64(
  slug: string
): { name: string; base64: string; mimeType: string }[] {
  const brand = getBrand(slug);
  if (!brand) return [];
  const out: { name: string; base64: string; mimeType: string }[] = [];
  for (const file of brand.style_files ?? []) {
    const ext = path.extname(file).toLowerCase();
    if (!isImageExt(ext)) continue;
    const buffer = fs.readFileSync(path.join(styleDirPath(slug), file));
    out.push({ name: file, base64: buffer.toString("base64"), mimeType: mimeFromExt(ext) });
  }
  return out;
}
