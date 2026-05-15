import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { AdminRuns } from "@/components/dashboard/AdminRuns";
import { isAdminEmail } from "@/lib/api/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!isAdminEmail(user.email)) {
    redirect("/dashboard");
  }

  return (
    <main className="app-shell">
      <nav className="nav">
        <Link href="/dashboard">Back to dashboard</Link>
        <SignOutButton />
      </nav>
      <AdminRuns />
    </main>
  );
}
