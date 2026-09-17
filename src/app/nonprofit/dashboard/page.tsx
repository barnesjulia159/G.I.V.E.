import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { SubmitButton } from "@/components/SubmitButton";
import { archiveOpportunity } from "@/lib/actions/opportunities";
import { createClient } from "@/lib/supabase/server";
import { Opportunity, Organization } from "@/lib/types";

type NonprofitDashboardPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

type OrganizationWithOpportunities = Organization & {
  opportunities: (Opportunity & {
    bookings: {
      status: string;
      attendance_logs: { status: string }[];
    }[];
  })[];
};

export default async function NonprofitDashboardPage({
  searchParams,
}: NonprofitDashboardPageProps) {
  const params = await searchParams;

  return (
    <RoleGate allowedRoles={["nonprofit"]}>
      <NonprofitDashboardContent message={params.message} error={params.error} />
    </RoleGate>
  );
}

async function NonprofitDashboardContent({
  message,
  error,
}: {
  message?: string;
  error?: string;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: organization } = await supabase
    .from("organizations")
    .select(
      `
      *,
      opportunities (
        *,
        bookings (
          status,
          attendance_logs (
            status
          )
        )
      )
    `
    )
    .eq("user_id", user!.id)
    .maybeSingle();

  const org = organization as OrganizationWithOpportunities | null;

  if (!org) {
    return (
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Nonprofit Dashboard</h1>
        <p className="mt-2 text-slate-700">
          Create your organization profile before posting volunteer
          opportunities.
        </p>

        <Link
          href="/nonprofit/organization"
          className="mt-5 inline-flex rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800"
        >
          Create Organization Profile
        </Link>
      </section>
    );
  }

  const activeOpportunities =
    org.opportunities?.filter((item) => !item.is_deleted) || [];

  return (
    <section>
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Nonprofit Dashboard</h1>
        <p className="mt-2 text-slate-700">{org.name}</p>

        {!org.is_approved && (
          <p className="alert-error mt-4">
            Your organization is pending admin approval. You can save
            opportunities as drafts, but publishing may be restricted.
          </p>
        )}

        {message && <p className="alert-info mt-4">{message}</p>}
        {error && <p className="alert-error mt-4">{error}</p>}

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/nonprofit/opportunities/new"
            className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800"
          >
            Create Opportunity
          </Link>

          <Link
            href="/nonprofit/organization"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 font-medium text-slate-800 hover:bg-slate-100"
          >
            Edit Organization Profile
          </Link>
        </div>
      </div>

      <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold">Your Opportunities</h2>

        {activeOpportunities.length === 0 ? (
          <p className="mt-3 text-slate-700">
            You have not created any opportunities yet.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-600">
                  <th className="py-3 pr-4">Title</th>
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Max capacity</th>
                  <th className="py-3 pr-4">Sign-ups</th>
                  <th className="py-3 pr-4">Checked-in</th>
                  <th className="py-3 pr-4">Actions</th>
                </tr>
              </thead>

              <tbody>
                {activeOpportunities.map((opportunity) => (
                  <tr key={opportunity.id} className="border-b">
                    <td className="py-3 pr-4 font-medium">
                      {opportunity.title}
                    </td>
                    <td className="py-3 pr-4">
                      {new Date(opportunity.start_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4 capitalize">
                      {opportunity.status}
                    </td>
                    <td className="py-3 pr-4">{opportunity.capacity}</td>
                    <td className="py-3 pr-4">
                      {opportunity.bookings?.filter(
                        (booking) => booking.status !== "cancelled"
                      ).length ?? 0}
                    </td>
                    <td className="py-3 pr-4">
                      {opportunity.bookings?.filter(
                        (booking) =>
                          booking.status !== "cancelled" &&
                          booking.attendance_logs?.some(
                            (attendance) => attendance.status === "present"
                          )
                      ).length ?? 0}
                    </td>
                    <td className="flex flex-wrap gap-2 py-3 pr-4">
                      <Link
                        href={`/nonprofit/opportunities/${opportunity.id}/edit`}
                        className="rounded-md bg-slate-800 px-3 py-2 text-white hover:bg-slate-900"
                      >
                        Edit
                      </Link>

                      <form action={archiveOpportunity}>
                        <input
                          type="hidden"
                          name="opportunity_id"
                          value={opportunity.id}
                        />
                        <SubmitButton
                          className="bg-red-700 px-3 py-2 hover:bg-red-800"
                          pendingText="Archiving..."
                        >
                          Archive
                        </SubmitButton>
                      </form>
                      {opportunity.status === "published" && (
                        <Link
                          href={`/nonprofit/opportunities/${opportunity.id}/participants`}
                          className="rounded-md border border-slate-300 px-3 py-2 text-slate-800 hover:bg-slate-100"
                        >
                          Participants
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
