import { NextRequest } from "next/server";
import {
  getHistory,
  getHistoryEntry,
  updateFeedback,
  deleteHistoryEntry,
  type HistoryRow,
  type HistoryStatus,
} from "@/lib/db";
import { requireUser } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  try {
    const { searchParams } = request.nextUrl;
    const format = searchParams.get("format");

    const filters = {
      brand_slug: searchParams.get("brand") || undefined,
      mode: searchParams.get("mode") || undefined,
      output_target: searchParams.get("target") || undefined,
      search: searchParams.get("search") || undefined,
      author: searchParams.get("author") || undefined,
      limit: searchParams.get("limit")
        ? parseInt(searchParams.get("limit")!)
        : format === "csv" || format === "json"
          ? 10000
          : undefined,
    };

    const history = getHistory(filters) as Record<string, unknown>[];

    if (format === "csv") {
      const headers = [
        "id",
        "timestamp",
        "mode",
        "output_target",
        "brand_slug",
        "created_by",
        "instruction",
        "generated_prompt",
        "rating",
      ];
      const csvRows = [headers.join(",")];
      for (const entry of history) {
        const row = headers.map((h) => {
          const val = entry[h];
          if (val === null || val === undefined) return "";
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        });
        csvRows.push(row.join(","));
      }
      return new Response(csvRows.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition":
            'attachment; filename="prompt-history.csv"',
        },
      });
    }

    return Response.json(history);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

function canMutate(row: HistoryRow | undefined, user: { email: string; isAdmin: boolean }): boolean {
  if (!row) return false;
  if (user.isAdmin) return true;
  return !!row.created_by && row.created_by.toLowerCase() === user.email;
}

export async function PATCH(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const { id, status, tags, notes } = body as {
      id: number;
      status?: HistoryStatus;
      tags?: string[] | null;
      notes?: string | null;
    };
    if (!id) {
      return Response.json({ error: "ID required" }, { status: 400 });
    }

    const row = getHistoryEntry(id) as HistoryRow | undefined;
    if (!row) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (!canMutate(row, auth.user)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const patch: Parameters<typeof updateFeedback>[1] = {};
    if ("status" in body) patch.status = status ?? null;
    if ("tags" in body) patch.tags = tags ?? null;
    if ("notes" in body) patch.notes = notes ?? null;

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    updateFeedback(id, patch);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get("id");
    if (!id) {
      return Response.json({ error: "ID required" }, { status: 400 });
    }
    const idNum = parseInt(id);
    const row = getHistoryEntry(idNum) as HistoryRow | undefined;
    if (!row) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (!canMutate(row, auth.user)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    deleteHistoryEntry(idNum);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
