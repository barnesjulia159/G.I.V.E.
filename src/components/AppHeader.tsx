import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import { NotificationBell } from "@/components/NotificationBell";

export async function AppHeader() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    role = profile?.role ?? null;
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="text-2xl font-bold text-emerald-800">
          GIVE
        </Link>

        <nav className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/opportunities" className="text-slate-700 hover:text-emerald-700">
            Opportunities
          </Link>

          {user && (
            <NotificationBell />
          )}

          {role === "volunteer" && (
            <>
              <Link href="/volunteer/dashboard" className="text-slate-700 hover:text-emerald-700">
                Volunteer Dashboard
              </Link>
              <Link href="/volunteer/bookings" className="text-slate-700 hover:text-emerald-700">
                My Bookings
              </Link>
              <Link href="/volunteer/hours" className="text-slate-700 hover:text-emerald-700">
                Hours
              </Link>
            </>
          )}

          {role === "nonprofit" && (
            <>
              <Link href="/nonprofit/dashboard" className="text-slate-700 hover:text-emerald-700">
                Nonprofit Dashboard
              </Link>
              <Link href="/nonprofit/opportunities/new" className="text-slate-700 hover:text-emerald-700">
                Post Opportunity
              </Link>
            </>
          )}

          {role === "admin" && (
            <Link href="/admin/dashboard" className="text-slate-700 hover:text-emerald-700">
              Admin
            </Link>
          )}

          {!user ? (
            <>
              <Link href="/login" className="text-slate-700 hover:text-emerald-700">
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-emerald-700 px-3 py-2 font-medium text-white hover:bg-emerald-800"
              >
                Register
              </Link>
            </>
          ) : (
            <form action={signOut}>
              <button className="text-slate-700 hover:text-emerald-700">Sign Out</button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}
