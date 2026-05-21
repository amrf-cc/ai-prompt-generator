import { auth } from "@/auth";
import { redirect } from "next/navigation";
import UsageClient from "./usage-client";

export default async function UsagePage() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) redirect("/login");

  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const isAdmin = !!adminEmail && email === adminEmail;

  return <UsageClient email={email} isAdmin={isAdmin} />;
}
