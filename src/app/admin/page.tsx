import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { AdminManagement } from "@/components/dashboard/AdminManagement";
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

  if (!(await isAdminEmail(user.email))) {
    redirect("/dashboard");
  }

  return (
    <main className="app-shell">
      <nav className="nav">
        <Link className="button secondary" href="/dashboard" aria-label="Back to scheduling dashboard">
          <span aria-hidden="true" style={{ marginRight: 6 }}>&larr;</span>
          Back to scheduling
        </Link>
        <SignOutButton />
      </nav>
      <div className="grid">
        <AdminRuns />
        <AdminManagement />
      </div>
    </main>
  );
}
