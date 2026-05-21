"use client";

import { useEffect, useMemo, useState } from "react";

interface BrandTotal {
  brand_slug: string;
  total_usd: number;
  month_usd: number;
  runs: number;
}

interface UsageRow {
  brand_slug: string;
  kind: "image" | "video" | "(all)";
  model_id: string;
  month: string;
  runs: number;
  usd: number;
}

interface UsageResponse {
  byBrand: BrandTotal[];
  rows: UsageRow[];
  estimatedUsd: number;
  providerUsd: number;
}

interface Props {
  email: string;
  isAdmin: boolean;
}

function fmtUsd(n: number): string {
  if (n >= 100) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

function toCsv(rows: UsageRow[]): string {
  const header = ["month", "brand_slug", "kind", "model_id", "runs", "usd"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.month, r.brand_slug, r.kind, r.model_id, r.runs, r.usd]
        .map((v) => {
          const s = String(v ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    );
  }
  return lines.join("\n");
}

export default function UsageClient({ isAdmin }: Props) {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (scope === "all" && isAdmin) params.set("scope", "all");
    if (brandFilter) params.set("brand", brandFilter);
    fetch(`/api/usage?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setErr(d.error);
          setData(null);
        } else {
          setData(d);
          setErr(null);
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [scope, brandFilter, isAdmin]);

  const totalUsd = useMemo(() => {
    if (!data) return 0;
    return data.byBrand.reduce((acc, b) => acc + b.total_usd, 0);
  }, [data]);
  const monthUsd = useMemo(() => {
    if (!data) return 0;
    return data.byBrand.reduce((acc, b) => acc + b.month_usd, 0);
  }, [data]);
  const allBrands = useMemo(
    () => (data?.byBrand ?? []).map((b) => b.brand_slug),
    [data]
  );

  function downloadCsv() {
    if (!data) return;
    const blob = new Blob([toCsv(data.rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold">Usage &amp; spend</h1>
        <a href="/" className="text-sm text-muted hover:text-fg underline">← Back</a>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        {isAdmin && (
          <div>
            <label className="text-xs text-muted block mb-1">Scope</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as "mine" | "all")}
              className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="mine">My runs</option>
              <option value="all">All users (admin)</option>
            </select>
          </div>
        )}
        <div>
          <label className="text-xs text-muted block mb-1">Brand</label>
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All brands</option>
            {allBrands.map((b) => (
              <option key={b} value={b === "(none)" ? "" : b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={downloadCsv}
          disabled={!data || data.rows.length === 0}
          className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-card-hover transition-colors disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {err && <div className="text-sm text-red-400">{err}</div>}
      {loading && <div className="text-sm text-muted">Loading…</div>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Total" value={fmtUsd(totalUsd)} />
            <Card label="This month" value={fmtUsd(monthUsd)} />
            <Card
              label="Provider-billed"
              value={fmtUsd(data.providerUsd)}
              hint="Cost reported directly by the model provider"
            />
            <Card
              label="Estimated"
              value={fmtUsd(data.estimatedUsd)}
              hint="Computed from media-models.json — provider didn't return a total"
            />
          </div>

          <section>
            <h2 className="text-lg font-medium mb-2">By brand</h2>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-card-hover text-muted">
                  <tr>
                    <th className="text-left px-3 py-2">Brand</th>
                    <th className="text-right px-3 py-2">Runs</th>
                    <th className="text-right px-3 py-2">This month</th>
                    <th className="text-right px-3 py-2">All-time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byBrand.length === 0 && (
                    <tr>
                      <td className="px-3 py-3 text-muted" colSpan={4}>
                        No media generations yet.
                      </td>
                    </tr>
                  )}
                  {data.byBrand.map((b) => (
                    <tr key={b.brand_slug} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{b.brand_slug}</td>
                      <td className="px-3 py-2 text-right">{b.runs}</td>
                      <td className="px-3 py-2 text-right">{fmtUsd(b.month_usd)}</td>
                      <td className="px-3 py-2 text-right">{fmtUsd(b.total_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-2">By brand × model × month</h2>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-card-hover text-muted">
                  <tr>
                    <th className="text-left px-3 py-2">Month</th>
                    <th className="text-left px-3 py-2">Brand</th>
                    <th className="text-left px-3 py-2">Kind</th>
                    <th className="text-left px-3 py-2">Model</th>
                    <th className="text-right px-3 py-2">Runs</th>
                    <th className="text-right px-3 py-2">USD</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr>
                      <td className="px-3 py-3 text-muted" colSpan={6}>
                        No rows.
                      </td>
                    </tr>
                  )}
                  {data.rows.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2">{r.month}</td>
                      <td className="px-3 py-2 font-mono">{r.brand_slug}</td>
                      <td className="px-3 py-2">{r.kind}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.model_id}</td>
                      <td className="px-3 py-2 text-right">{r.runs}</td>
                      <td className="px-3 py-2 text-right">{fmtUsd(r.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-border rounded-lg p-3" title={hint}>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
