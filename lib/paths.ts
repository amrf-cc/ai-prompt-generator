import path from "path";

export const DATA_DIR =
  process.env.DATA_DIR ?? path.join(process.cwd(), "data");

export const BRANDS_DIR =
  process.env.BRANDS_DIR ?? path.join(process.cwd(), "brands");

export const CONFIG_DIR =
  process.env.CONFIG_DIR ?? path.join(process.cwd(), "config");

export const UPLOADS_DIR =
  process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");

export const PRODUCTS_DIR =
  process.env.PRODUCTS_DIR ?? path.join(process.cwd(), "products");
