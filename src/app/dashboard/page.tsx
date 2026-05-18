import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { ensureProfile, isAdminEmail } from "@/lib/api/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await ensureProfile(user);

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("tz")
    .eq("id", user.id)
    .single();

  const userIsAdmin = await isAdminEmail(user.email);

  return (
    <main className="app-shell">
      <nav className="nav">
        <div>
          <Link href="/">GPU Scheduler</Link>
          <p className="muted">{user.email}</p>
        </div>
        <div className="nav-links">
          {userIsAdmin ? (
            <Link className="button secondary" href="/admin">
              Admin
            </Link>
          ) : null}
          <SignOutButton />
        </div>
      </nav>
      <DashboardClient
        initialProfile={{
          tz: profile?.tz ?? "UTC"
        }}
      />
    </main>
  );
}
