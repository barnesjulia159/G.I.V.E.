import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import { NotificationBell } from "@/components/NotificationBell";
import { SiteNavigation } from "@/components/SiteNavigation";

export async function AppHeader() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .single();

    role = profile?.is_active === true ? profile.role : null;
  }

  const navLinkClass = "text-sm font-medium text-slate-600 transition hover:text-teal-800";

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur">
      <div className="site-header-inner">
        <Link href="/" className="flex shrink-0 items-center gap-3 text-slate-950">
          <span className="grid size-10 place-items-center rounded-xl bg-teal-800 text-lg font-bold text-white shadow-sm">
            G
          </span>
          <span className="leading-tight">
            <span className="block text-xl font-bold tracking-tight">GIVE</span>
            <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Volunteer Platform
            </span>
          </span>
        </Link>

        <SiteNavigation>
            <Link href="/opportunities" className={navLinkClass}>
              Opportunities
            </Link>

            {user && role && <NotificationBell key={user.id} />}

            {role === "volunteer" && (
              <>
                <Link href="/volunteer/dashboard" className={navLinkClass}>
                  Volunteer Dashboard
                </Link>
                <Link href="/volunteer/bookings" className={navLinkClass}>
                  My Bookings
                </Link>
                <Link href="/volunteer/hours" className={navLinkClass}>
                  Hours
                </Link>
              </>
            )}

            {role === "nonprofit" && (
              <>
                <Link href="/nonprofit/dashboard" className={navLinkClass}>
                  Nonprofit Dashboard
                </Link>
                <Link href="/nonprofit/reports" className={navLinkClass}>
                  Tracking &amp; Reports
                </Link>
                <Link href="/nonprofit/opportunities/new" className={navLinkClass}>
                  Post Opportunity
                </Link>
              </>
            )}

            {role === "admin" && (
              <Link href="/admin/dashboard" className={navLinkClass}>
                Admin
              </Link>
            )}

            {!user ? (
              <>
                <Link href="/login" className={navLinkClass}>
                  Login
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900"
                >
                  Register
                </Link>
              </>
            ) : (
              <form action={signOut}>
                <button type="submit" className={navLinkClass}>Sign Out</button>
              </form>
            )}
        </SiteNavigation>
      </div>
    </header>
  );
}
