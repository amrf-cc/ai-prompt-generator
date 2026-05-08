import Database from "better-sqlite3";
import path from "path";
import { DATA_DIR } from "./paths";

const DB_PATH = path.join(DATA_DIR, "history.db");

let db: Database.Database | null = null;

export type HistoryStatus = "used" | "discarded" | null;

const PROVENANCE_COLUMNS: { name: string; ddl: string }[] = [
  { name: "model_used", ddl: "model_used TEXT" },
  { name: "rules_hash", ddl: "rules_hash TEXT" },
  { name: "system_prompt_hash", ddl: "system_prompt_hash TEXT" },
  { name: "tags", ddl: "tags TEXT" },
  { name: "notes", ddl: "notes TEXT" },
  { name: "status", ddl: "status TEXT" },
  { name: "created_by", ddl: "created_by TEXT" },
];

function getDb(): Database.Database {
  if (!db) {
    const fs = require("fs");
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        mode TEXT NOT NULL,
        output_target TEXT NOT NULL,
        brand_slug TEXT,
        instruction TEXT NOT NULL,
        generated_prompt TEXT NOT NULL,
        image_paths TEXT NOT NULL DEFAULT '[]'
      )
    `);

    const cols = db.prepare("PRAGMA table_info(history)").all() as { name: string }[];
    const existing = new Set(cols.map((c) => c.name));

    if (!existing.has("rating")) {
      db.exec("ALTER TABLE history ADD COLUMN rating INTEGER DEFAULT NULL");
    }
    for (const col of PROVENANCE_COLUMNS) {
      if (!existing.has(col.name)) {
        db.exec(`ALTER TABLE history ADD COLUMN ${col.ddl}`);
      }
    }
  }
  return db;
}

export function saveToHistory(entry: {
  mode: string;
  output_target: string;
  brand_slug: string | null;
  instruction: string;
  generated_prompt: string;
  image_paths: string[];
  model_used?: string | null;
  rules_hash?: string | null;
  system_prompt_hash?: string | null;
  created_by?: string | null;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO history
      (mode, output_target, brand_slug, instruction, generated_prompt, image_paths,
       model_used, rules_hash, system_prompt_hash, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    entry.mode,
    entry.output_target,
    entry.brand_slug,
    entry.instruction,
    entry.generated_prompt,
    JSON.stringify(entry.image_paths),
    entry.model_used ?? null,
    entry.rules_hash ?? null,
    entry.system_prompt_hash ?? null,
    entry.created_by ?? null
  );
}

export function getHistory(filters?: {
  brand_slug?: string;
  mode?: string;
  output_target?: string;
  search?: string;
  author?: string;
  limit?: number;
}) {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.brand_slug) {
    conditions.push("brand_slug = ?");
    params.push(filters.brand_slug);
  }
  if (filters?.mode) {
    conditions.push("mode = ?");
    params.push(filters.mode);
  }
  if (filters?.output_target) {
    conditions.push("output_target = ?");
    params.push(filters.output_target);
  }
  if (filters?.author) {
    conditions.push("created_by = ?");
    params.push(filters.author.toLowerCase());
  }
  if (filters?.search) {
    conditions.push(
      "(instruction LIKE ? OR generated_prompt LIKE ?)"
    );
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters?.limit ?? 50;

  return db
    .prepare(
      `SELECT * FROM history ${where} ORDER BY timestamp DESC LIMIT ?`
    )
    .all(...params, limit);
}

export function getHistoryEntry(id: number) {
  const db = getDb();
  return db.prepare("SELECT * FROM history WHERE id = ?").get(id);
}


export function updateStatus(id: number, status: HistoryStatus) {
  const db = getDb();
  return db.prepare("UPDATE history SET status = ? WHERE id = ?").run(status, id);
}

export function updateTags(id: number, tags: string[] | null) {
  const db = getDb();
  return db
    .prepare("UPDATE history SET tags = ? WHERE id = ?")
    .run(tags === null ? null : JSON.stringify(tags), id);
}

export function updateNotes(id: number, notes: string | null) {
  const db = getDb();
  return db.prepare("UPDATE history SET notes = ? WHERE id = ?").run(notes, id);
}

export function updateFeedback(
  id: number,
  patch: {
    rating?: number | null;
    status?: HistoryStatus;
    tags?: string[] | null;
    notes?: string | null;
  }
) {
  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  if ("rating" in patch) {
    sets.push("rating = ?");
    params.push(patch.rating);
  }
  if ("status" in patch) {
    sets.push("status = ?");
    params.push(patch.status);
  }
  if ("tags" in patch) {
    sets.push("tags = ?");
    params.push(patch.tags === null || patch.tags === undefined ? null : JSON.stringify(patch.tags));
  }
  if ("notes" in patch) {
    sets.push("notes = ?");
    params.push(patch.notes);
  }
  if (sets.length === 0) return null;
  params.push(id);
  return db.prepare(`UPDATE history SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

export function deleteHistoryEntry(id: number) {
  const db = getDb();
  return db.prepare("DELETE FROM history WHERE id = ?").run(id);
}

export interface InsightsRow {
  group_key: string;
  count: number;
  avg_rating: number | null;
  used: number;
  discarded: number;
}

export interface InsightsResponse {
  by_target: InsightsRow[];
  by_target_mode: InsightsRow[];
  by_brand: InsightsRow[];
  by_model: InsightsRow[];
  by_rules_hash: InsightsRow[];
  top_rated: HistoryRow[];
  bottom_rated: HistoryRow[];
  failure_tags: { tag: string; count: number }[];
  totals: { total: number; rated: number; tagged: number };
}

export interface HistoryRow {
  id: number;
  timestamp: string;
  mode: string;
  output_target: string;
  brand_slug: string | null;
  instruction: string;
  generated_prompt: string;
  image_paths: string;
  rating: number | null;
  model_used: string | null;
  rules_hash: string | null;
  system_prompt_hash: string | null;
  tags: string | null;
  notes: string | null;
  status: HistoryStatus;
  created_by: string | null;
}

function aggregate(groupBy: string): InsightsRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT
         COALESCE(${groupBy}, '(none)') AS group_key,
         COUNT(*) AS count,
         ROUND(AVG(rating), 2) AS avg_rating,
         SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) AS used,
         SUM(CASE WHEN status = 'discarded' THEN 1 ELSE 0 END) AS discarded
       FROM history
       GROUP BY group_key
       ORDER BY count DESC`
    )
    .all() as InsightsRow[];
}

export function getInsights(): InsightsResponse {
  const db = getDb();

  const by_target = aggregate("output_target");
  const by_target_mode = (
    db
      .prepare(
        `SELECT
           output_target || ' / ' || mode AS group_key,
           COUNT(*) AS count,
           ROUND(AVG(rating), 2) AS avg_rating,
           SUM(CASE WHEN status = 'used' THEN 1 ELSE 0 END) AS used,
           SUM(CASE WHEN status = 'discarded' THEN 1 ELSE 0 END) AS discarded
         FROM history
         GROUP BY output_target, mode
         ORDER BY count DESC`
      )
      .all() as InsightsRow[]
  );
  const by_brand = aggregate("brand_slug");
  const by_model = aggregate("model_used");
  const by_rules_hash = aggregate("rules_hash");

  const top_rated = db
    .prepare(
      `SELECT * FROM history WHERE rating IS NOT NULL ORDER BY rating DESC, timestamp DESC LIMIT 5`
    )
    .all() as HistoryRow[];

  const bottom_rated = db
    .prepare(
      `SELECT * FROM history WHERE rating IS NOT NULL ORDER BY rating ASC, timestamp DESC LIMIT 5`
    )
    .all() as HistoryRow[];

  const taggedRows = db
    .prepare(
      `SELECT tags, rating FROM history WHERE tags IS NOT NULL AND tags != ''`
    )
    .all() as { tags: string; rating: number | null }[];

  const tagCounts = new Map<string, number>();
  for (const row of taggedRows) {
    if (row.rating !== null && row.rating > 3) continue;
    try {
      const parsed = JSON.parse(row.tags) as string[];
      for (const tag of parsed) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    } catch {
      // ignore malformed tag JSON
    }
  }
  const failure_tags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  const totals = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN rating IS NOT NULL THEN 1 ELSE 0 END) AS rated,
         SUM(CASE WHEN tags IS NOT NULL AND tags != '' THEN 1 ELSE 0 END) AS tagged
       FROM history`
    )
    .get() as { total: number; rated: number; tagged: number };

  return {
    by_target,
    by_target_mode,
    by_brand,
    by_model,
    by_rules_hash,
    top_rated,
    bottom_rated,
    failure_tags,
    totals,
  };
}
