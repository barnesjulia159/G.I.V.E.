import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { createClient } from "@/lib/supabase/server";
import { AdminPlatformSummary } from "@/lib/types";
import { SendTestEmailButton } from "@/components/SendTestEmailButton";

type AdminSummaryRow = AdminPlatformSummary | null;

export default async function AdminDashboardPage() {
  return (
    <RoleGate allowedRoles={["admin"]}>
      <AdminDashboardContent />
    </RoleGate>
  );
}

async function AdminDashboardContent() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("admin_platform_summary")
    .select("*")
    .maybeSingle();

  const summary = data as AdminSummaryRow;

  return (
    <section>
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>

        <p className="mt-2 text-slate-700">
          Review platform activity, manage users, approve organizations, and
          monitor bookings.
        </p>

        {error && <p className="alert-error mt-4">{error.message}</p>}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <SummaryCard label="Total Users" value={summary?.total_users ?? 0} />
        <SummaryCard
          label="Volunteers"
          value={summary?.total_volunteers ?? 0}
        />
        <SummaryCard
          label="Nonprofits"
          value={summary?.total_nonprofits ?? 0}
        />
        <SummaryCard
          label="Pending Organizations"
          value={summary?.pending_organizations ?? 0}
        />
        <SummaryCard
          label="Published Opportunities"
          value={summary?.published_opportunities ?? 0}
        />
        <SummaryCard
          label="Active Bookings"
          value={summary?.active_bookings ?? 0}
        />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <AdminLinkCard
          href="/admin/users"
          title="Manage Users"
          description="View registered volunteers, nonprofits, and admins."
        />

        <AdminLinkCard
          href="/admin/organizations"
          title="Manage Organizations"
          description="Approve nonprofit organization profiles."
        />

        <AdminLinkCard
          href="/admin/bookings"
          title="Manage Bookings"
          description="Review volunteer booking activity."
        />
      </div>

      <SendTestEmailButton />
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-4xl font-bold text-emerald-700">{value}</p>
    </div>
  );
}

function AdminLinkCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl bg-white p-5 shadow-sm hover:ring-2 hover:ring-emerald-600"
    >
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-slate-700">{description}</p>
    </Link>
  );
}
