import Link from "next/link";

export default function Home() {
  return (
    <main className="app-shell">
      <section className="card stack">
        <span className="pill">GPU Endpoint Scheduling</span>
        <h1>Reserve model sessions without crossing the 100-user cap.</h1>
        <p className="muted">
          Submit flexible or rigid session requests, let the scheduler confirm
          feasible slots, and watch aggregate utilization update in realtime.
        </p>
        <div className="nav-links">
          <Link className="button" href="/dashboard">
            Open dashboard
          </Link>
          <Link className="button secondary" href="/login">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
