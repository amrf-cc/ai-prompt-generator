import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getLockedBrandSlugs } from "@/lib/auth-helpers";
import PageClient from "./page-client";

export default async function Home() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) redirect("/login");

  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const isAdmin = !!adminEmail && email === adminEmail;

  return (
    <PageClient
      currentUser={{
        email,
        name: session?.user?.name ?? null,
        isAdmin,
      }}
      lockedBrandSlugs={getLockedBrandSlugs()}
    />
  );
}
