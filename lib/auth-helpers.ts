import { auth } from "@/auth";

export interface AuthedUser {
  email: string;
  name: string | null;
  isAdmin: boolean;
}

export type AuthResult =
  | { user: AuthedUser; error?: never }
  | { user?: never; error: Response };

function adminEmail(): string {
  return (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
}

function lockedSlugs(): string[] {
  const csv = process.env.LOCKED_BRAND_SLUGS ?? "chip-city";
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function requireUser(): Promise<AuthResult> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) {
    return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return {
    user: {
      email,
      name: session?.user?.name ?? null,
      isAdmin: !!adminEmail() && email === adminEmail(),
    },
  };
}

export async function requireAdmin(): Promise<AuthResult> {
  const r = await requireUser();
  if (r.error) return r;
  if (!r.user.isAdmin) {
    return { error: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return r;
}

export function isBrandLocked(slug: string): boolean {
  return lockedSlugs().includes(slug);
}

export function assertCanEditBrand(
  slug: string,
  user: { isAdmin: boolean }
): Response | null {
  if (isBrandLocked(slug) && !user.isAdmin) {
    return Response.json(
      { error: "Brand is locked — admin only" },
      { status: 403 }
    );
  }
  return null;
}

export function getLockedBrandSlugs(): string[] {
  return lockedSlugs();
}
