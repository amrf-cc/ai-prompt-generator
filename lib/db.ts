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

    db.exec(`
      CREATE TABLE IF NOT EXISTS media_generations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        kind TEXT NOT NULL,
        brand_slug TEXT,
        model_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        history_id INTEGER,
        duration_sec REAL,
        aspect_ratio TEXT,
        image_size TEXT,
        image_count INTEGER,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cost_usd REAL NOT NULL DEFAULT 0,
        cost_source TEXT NOT NULL DEFAULT 'unknown',
        cost_components TEXT,
        status TEXT NOT NULL DEFAULT 'success',
        result_url TEXT,
        job_id TEXT,
        error TEXT,
        created_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_media_brand ON media_generations(brand_slug);
      CREATE INDEX IF NOT EXISTS idx_media_timestamp ON media_generations(timestamp);
      CREATE INDEX IF NOT EXISTS idx_media_job ON media_generations(job_id);
    `);
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

export type MediaKind = "image" | "video";
export type MediaStatus = "success" | "failed" | "pending";
export type CostSource = "provider" | "computed" | "unknown";

export interface MediaGenerationInsert {
  kind: MediaKind;
  brand_slug: string | null;
  model_id: string;
  prompt: string;
  history_id?: number | null;
  duration_sec?: number | null;
  aspect_ratio?: string | null;
  image_size?: string | null;
  image_count?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cost_usd: number;
  cost_source: CostSource;
  cost_components?: unknown;
  status: MediaStatus;
  result_url?: string | null;
  job_id?: string | null;
  error?: string | null;
  created_by?: string | null;
}

export function insertMediaGeneration(entry: MediaGenerationInsert): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO media_generations
      (kind, brand_slug, model_id, prompt, history_id,
       duration_sec, aspect_ratio, image_size, image_count,
       input_tokens, output_tokens,
       cost_usd, cost_source, cost_components,
       status, result_url, job_id, error, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    entry.kind,
    entry.brand_slug,
    entry.model_id,
    entry.prompt,
    entry.history_id ?? null,
    entry.duration_sec ?? null,
    entry.aspect_ratio ?? null,
    entry.image_size ?? null,
    entry.image_count ?? null,
    entry.input_tokens ?? null,
    entry.output_tokens ?? null,
    entry.cost_usd,
    entry.cost_source,
    entry.cost_components ? JSON.stringify(entry.cost_components) : null,
    entry.status,
    entry.result_url ?? null,
    entry.job_id ?? null,
    entry.error ?? null,
    entry.created_by ?? null
  );
  return info.lastInsertRowid as number;
}

export interface MediaGenerationUpdate {
  duration_sec?: number | null;
  cost_usd?: number;
  cost_source?: CostSource;
  cost_components?: unknown;
  status?: MediaStatus;
  result_url?: string | null;
  error?: string | null;
}

export function updateMediaGeneration(id: number, patch: MediaGenerationUpdate) {
  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  if ("duration_sec" in patch) {
    sets.push("duration_sec = ?");
    params.push(patch.duration_sec);
  }
  if ("cost_usd" in patch) {
    sets.push("cost_usd = ?");
    params.push(patch.cost_usd);
  }
  if ("cost_source" in patch) {
    sets.push("cost_source = ?");
    params.push(patch.cost_source);
  }
  if ("cost_components" in patch) {
    sets.push("cost_components = ?");
    params.push(patch.cost_components ? JSON.stringify(patch.cost_components) : null);
  }
  if ("status" in patch) {
    sets.push("status = ?");
    params.push(patch.status);
  }
  if ("result_url" in patch) {
    sets.push("result_url = ?");
    params.push(patch.result_url);
  }
  if ("error" in patch) {
    sets.push("error = ?");
    params.push(patch.error);
  }
  if (sets.length === 0) return null;
  params.push(id);
  return db
    .prepare(`UPDATE media_generations SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params);
}

export function findMediaGenerationByJobId(jobId: string) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM media_generations WHERE job_id = ?")
    .get(jobId) as MediaGenerationRow | undefined;
}

export interface MediaGenerationRow {
  id: number;
  timestamp: string;
  kind: MediaKind;
  brand_slug: string | null;
  model_id: string;
  prompt: string;
  history_id: number | null;
  duration_sec: number | null;
  aspect_ratio: string | null;
  image_size: string | null;
  image_count: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number;
  cost_source: CostSource;
  cost_components: string | null;
  status: MediaStatus;
  result_url: string | null;
  job_id: string | null;
  error: string | null;
  created_by: string | null;
}

export interface UsageRow {
  brand_slug: string;
  kind: MediaKind | "(all)";
  model_id: string | "(all)";
  month: string;
  runs: number;
  usd: number;
}

export interface UsageSummary {
  /** All-time and current-month totals, per brand. */
  byBrand: { brand_slug: string; total_usd: number; month_usd: number; runs: number }[];
  /** Detailed breakdown rows: brand × model × month. */
  rows: UsageRow[];
  /** Sum of cost_usd from rows whose cost_source = 'computed' or 'unknown' (i.e. not provider-verified). */
  estimatedUsd: number;
  /** Sum of cost_usd from rows whose cost_source = 'provider'. */
  providerUsd: number;
}

export function getUsage(filters?: {
  brand_slug?: string;
  since?: string;
  created_by?: string;
}): UsageSummary {
  const db = getDb();
  const conditions: string[] = ["status = 'success'"];
  const params: unknown[] = [];
  if (filters?.brand_slug) {
    conditions.push("brand_slug = ?");
    params.push(filters.brand_slug);
  }
  if (filters?.since) {
    conditions.push("timestamp >= ?");
    params.push(filters.since);
  }
  if (filters?.created_by) {
    conditions.push("created_by = ?");
    params.push(filters.created_by.toLowerCase());
  }
  const where = `WHERE ${conditions.join(" AND ")}`;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthIso = monthStart.toISOString().slice(0, 19).replace("T", " ");

  const byBrand = db
    .prepare(
      `SELECT
         COALESCE(brand_slug, '(none)') AS brand_slug,
         COUNT(*) AS runs,
         ROUND(SUM(cost_usd), 4) AS total_usd,
         ROUND(SUM(CASE WHEN timestamp >= ? THEN cost_usd ELSE 0 END), 4) AS month_usd
       FROM media_generations
       ${where}
       GROUP BY brand_slug
       ORDER BY total_usd DESC`
    )
    .all(monthIso, ...params) as {
    brand_slug: string;
    runs: number;
    total_usd: number;
    month_usd: number;
  }[];

  const rows = db
    .prepare(
      `SELECT
         COALESCE(brand_slug, '(none)') AS brand_slug,
         kind,
         model_id,
         strftime('%Y-%m', timestamp) AS month,
         COUNT(*) AS runs,
         ROUND(SUM(cost_usd), 4) AS usd
       FROM media_generations
       ${where}
       GROUP BY brand_slug, kind, model_id, month
       ORDER BY month DESC, usd DESC`
    )
    .all(...params) as UsageRow[];

  const totals = db
    .prepare(
      `SELECT
         ROUND(SUM(CASE WHEN cost_source = 'provider' THEN cost_usd ELSE 0 END), 4) AS provider_usd,
         ROUND(SUM(CASE WHEN cost_source != 'provider' THEN cost_usd ELSE 0 END), 4) AS estimated_usd
       FROM media_generations
       ${where}`
    )
    .get(...params) as { provider_usd: number | null; estimated_usd: number | null };

  return {
    byBrand,
    rows,
    estimatedUsd: totals.estimated_usd ?? 0,
    providerUsd: totals.provider_usd ?? 0,
  };
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
