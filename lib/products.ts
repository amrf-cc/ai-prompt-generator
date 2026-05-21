import fs from "fs";
import path from "path";
import type { ProductAsset, ProductImage } from "./types";
import { BRANDS_DIR } from "./paths";

const PRODUCTS_SUBDIR = "products";
const INDEX_FILENAME = "products.json";
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

interface ProductImageEntry {
  filename: string;
  label: string;
  description?: string;
}

interface ProductIndexEntry {
  id: string;
  name: string;
  categories?: string[];
  images?: ProductImageEntry[];
  /** Legacy single-image field. Migrated to `images` on first read. */
  filename?: string;
}

interface ProductIndex {
  products: ProductIndexEntry[];
}

function productsDirPath(brandSlug: string): string {
  return path.join(BRANDS_DIR, brandSlug, PRODUCTS_SUBDIR);
}

function ensureDir(brandSlug: string) {
  const dir = productsDirPath(brandSlug);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function indexPath(brandSlug: string): string {
  return path.join(productsDirPath(brandSlug), INDEX_FILENAME);
}

function defaultLabelFor(filename: string): string {
  const base = path.basename(filename, path.extname(filename));
  return base.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeImageEntry(img: ProductImageEntry): ProductImageEntry {
  const label = img.label?.trim() || defaultLabelFor(img.filename);
  const description = img.description?.trim();
  return {
    filename: img.filename,
    label,
    ...(description ? { description } : {}),
  };
}

function normalizeEntry(entry: ProductIndexEntry): {
  entry: ProductIndexEntry;
  changed: boolean;
} {
  let changed = false;
  let images: ProductImageEntry[];

  if (Array.isArray(entry.images) && entry.images.length > 0) {
    images = entry.images.map(normalizeImageEntry);
  } else if (entry.filename) {
    images = [
      {
        filename: entry.filename,
        label: defaultLabelFor(entry.filename),
      },
    ];
    changed = true;
  } else {
    images = [];
  }

  if (entry.filename !== undefined) changed = true;

  return {
    entry: {
      id: entry.id,
      name: entry.name,
      categories: entry.categories,
      images,
    },
    changed,
  };
}

function readIndex(brandSlug: string): { idx: ProductIndex; migrated: boolean } {
  const p = indexPath(brandSlug);
  if (!fs.existsSync(p)) return { idx: { products: [] }, migrated: false };
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as ProductIndex;
    if (!parsed || !Array.isArray(parsed.products)) {
      return { idx: { products: [] }, migrated: false };
    }
    let migrated = false;
    const products = parsed.products.map((entry) => {
      const norm = normalizeEntry(entry);
      if (norm.changed) migrated = true;
      return norm.entry;
    });
    return { idx: { products }, migrated };
  } catch {
    return { idx: { products: [] }, migrated: false };
  }
}

function writeIndex(brandSlug: string, idx: ProductIndex) {
  ensureDir(brandSlug);
  fs.writeFileSync(indexPath(brandSlug), JSON.stringify(idx, null, 2));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeCategories(categories: unknown): string[] {
  const values = Array.isArray(categories) ? categories : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function imageToProductImage(
  brandSlug: string,
  entry: ProductImageEntry
): ProductImage {
  return {
    filename: entry.filename,
    label: entry.label,
    description: entry.description,
    url: `/api/product-asset?brand=${encodeURIComponent(brandSlug)}&file=${encodeURIComponent(entry.filename)}`,
  };
}

function toAsset(entry: ProductIndexEntry, brandSlug: string): ProductAsset {
  const images = (entry.images ?? []).map((img) =>
    imageToProductImage(brandSlug, img)
  );
  const primary = images[0];
  return {
    id: entry.id,
    name: entry.name,
    filename: primary?.filename ?? "",
    url: primary?.url ?? "",
    categories: normalizeCategories(entry.categories),
    brandSlug,
    images,
  };
}

function uniqueFilename(brandSlug: string, filename: string): string {
  ensureDir(brandSlug);
  const dir = productsDirPath(brandSlug);
  if (!fs.existsSync(path.join(dir, filename))) return filename;
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let i = 1;
  while (fs.existsSync(path.join(dir, `${base}-${i}${ext}`))) i++;
  return `${base}-${i}${ext}`;
}

function uniqueId(brandSlug: string, id: string, exclude?: string): string {
  const { idx } = readIndex(brandSlug);
  const taken = new Set(idx.products.map((p) => p.id).filter((x) => x !== exclude));
  if (!taken.has(id)) return id;
  let i = 1;
  while (taken.has(`${id}-${i}`)) i++;
  return `${id}-${i}`;
}

export function listProducts(brandSlug: string): ProductAsset[] {
  ensureDir(brandSlug);
  const dir = productsDirPath(brandSlug);
  const { idx, migrated } = readIndex(brandSlug);
  const onDisk = new Set(
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && IMAGE_EXTS.includes(path.extname(d.name).toLowerCase()))
      .map((d) => d.name)
  );

  let pruned = false;
  const cleaned = idx.products.map((entry) => {
    const filtered = (entry.images ?? []).filter((img) => onDisk.has(img.filename));
    if (filtered.length !== (entry.images?.length ?? 0)) pruned = true;
    return { ...entry, images: filtered };
  });

  if (migrated || pruned) {
    writeIndex(brandSlug, { products: cleaned });
  }

  const out: ProductAsset[] = [];
  const seenFilenames = new Set<string>();
  for (const entry of cleaned) {
    if ((entry.images ?? []).length === 0) continue;
    out.push(toAsset(entry, brandSlug));
    for (const img of entry.images!) seenFilenames.add(img.filename);
  }

  // Pick up images sitting in the folder that aren't tracked yet (manual drops).
  for (const filename of onDisk) {
    if (seenFilenames.has(filename)) continue;
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const id = uniqueId(brandSlug, slugify(base) || base);
    const entry: ProductIndexEntry = {
      id,
      name: base,
      categories: [],
      images: [{ filename, label: defaultLabelFor(filename) }],
    };
    out.push(toAsset(entry, brandSlug));
  }
  return out;
}

export function getProduct(brandSlug: string, id: string): ProductAsset | null {
  return listProducts(brandSlug).find((p) => p.id === id) ?? null;
}

export function saveProduct(
  brandSlug: string,
  displayName: string,
  originalFilename: string,
  buffer: Buffer,
  categories: string[] = [],
  imageLabel: string = "Hero shot",
  imageDescription?: string
): ProductAsset {
  ensureDir(brandSlug);
  const ext = path.extname(originalFilename).toLowerCase();
  if (!IMAGE_EXTS.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }
  const baseSlug =
    slugify(displayName) || slugify(path.basename(originalFilename, ext)) || "product";
  const id = uniqueId(brandSlug, baseSlug);
  const filename = uniqueFilename(brandSlug, `${id}${ext}`);
  fs.writeFileSync(path.join(productsDirPath(brandSlug), filename), buffer);

  const { idx } = readIndex(brandSlug);
  const label = imageLabel.trim() || "Hero shot";
  const description = imageDescription?.trim();
  const entry: ProductIndexEntry = {
    id,
    name: displayName.trim() || baseSlug,
    categories: normalizeCategories(categories),
    images: [
      {
        filename,
        label,
        ...(description ? { description } : {}),
      },
    ],
  };
  idx.products.push(entry);
  writeIndex(brandSlug, idx);
  return toAsset(entry, brandSlug);
}

export function addProductImage(
  brandSlug: string,
  productId: string,
  originalFilename: string,
  buffer: Buffer,
  label: string,
  description?: string
): ProductAsset | null {
  ensureDir(brandSlug);
  const ext = path.extname(originalFilename).toLowerCase();
  if (!IMAGE_EXTS.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }
  const trimmedLabel = label?.trim();
  if (!trimmedLabel) {
    throw new Error("label is required");
  }
  const { idx } = readIndex(brandSlug);
  const entry = idx.products.find((p) => p.id === productId);
  if (!entry) return null;

  const labelSlug = slugify(trimmedLabel) || "image";
  const filename = uniqueFilename(brandSlug, `${productId}-${labelSlug}${ext}`);
  fs.writeFileSync(path.join(productsDirPath(brandSlug), filename), buffer);

  const trimmedDescription = description?.trim();
  entry.images = entry.images ?? [];
  entry.images.push({
    filename,
    label: trimmedLabel,
    ...(trimmedDescription ? { description: trimmedDescription } : {}),
  });
  writeIndex(brandSlug, idx);
  return toAsset(entry, brandSlug);
}

export function removeProductImage(
  brandSlug: string,
  productId: string,
  filename: string
): ProductAsset | null {
  const { idx } = readIndex(brandSlug);
  const entry = idx.products.find((p) => p.id === productId);
  if (!entry) return null;
  const before = entry.images?.length ?? 0;
  entry.images = (entry.images ?? []).filter((img) => img.filename !== filename);
  if (entry.images.length === before) return toAsset(entry, brandSlug);
  const filePath = path.join(productsDirPath(brandSlug), filename);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    fs.unlinkSync(filePath);
  }
  writeIndex(brandSlug, idx);
  return toAsset(entry, brandSlug);
}

export function updateProductImage(
  brandSlug: string,
  productId: string,
  filename: string,
  patch: { label?: string; description?: string }
): ProductAsset | null {
  const { idx } = readIndex(brandSlug);
  const entry = idx.products.find((p) => p.id === productId);
  if (!entry) return null;
  const image = (entry.images ?? []).find((img) => img.filename === filename);
  if (!image) return null;
  if (patch.label !== undefined) {
    const trimmed = patch.label.trim();
    if (!trimmed) throw new Error("label cannot be empty");
    image.label = trimmed;
  }
  if (patch.description !== undefined) {
    const trimmed = patch.description.trim();
    if (trimmed) image.description = trimmed;
    else delete image.description;
  }
  writeIndex(brandSlug, idx);
  return toAsset(entry, brandSlug);
}

export function updateProductCategories(
  brandSlug: string,
  id: string,
  categories: string[]
): boolean {
  const { idx } = readIndex(brandSlug);
  const entry = idx.products.find((p) => p.id === id);
  if (!entry) return false;
  entry.categories = normalizeCategories(categories);
  writeIndex(brandSlug, idx);
  return true;
}

export function listProductCategories(brandSlug: string): string[] {
  const seen = new Map<string, string>();
  for (const product of listProducts(brandSlug)) {
    for (const category of product.categories) {
      const key = category.toLowerCase();
      if (!seen.has(key)) seen.set(key, category);
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

export function deleteProduct(brandSlug: string, id: string): boolean {
  const { idx } = readIndex(brandSlug);
  const entry = idx.products.find((p) => p.id === id);
  let filenames: string[] = [];
  if (entry) {
    filenames = (entry.images ?? []).map((img) => img.filename);
  } else {
    const fallback = listProducts(brandSlug).find((p) => p.id === id);
    if (!fallback) return false;
    filenames = fallback.images.map((img) => img.filename);
  }
  for (const filename of filenames) {
    const filePath = path.join(productsDirPath(brandSlug), filename);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
    }
  }
  if (entry) {
    idx.products = idx.products.filter((p) => p.id !== id);
    writeIndex(brandSlug, idx);
  }
  return true;
}

/** Serve a product image as a buffer, checking it belongs to the given brand. */
export function getProductFile(
  brandSlug: string,
  filename: string
): { buffer: Buffer; ext: string } | null {
  const safe = path.basename(filename);
  if (safe !== filename) return null; // reject any path traversal
  const filePath = path.join(productsDirPath(brandSlug), safe);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  const ext = path.extname(safe).toLowerCase();
  if (!IMAGE_EXTS.includes(ext)) return null;
  return { buffer: fs.readFileSync(filePath), ext };
}
