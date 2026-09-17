import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { SubmitButton } from "@/components/SubmitButton";
import { cancelBooking } from "@/lib/actions/bookings";
import { createClient } from "@/lib/supabase/server";
import { BookingWithOpportunity } from "@/lib/types";
import { AttendanceControls } from "@/components/AttendanceControls";

type VolunteerBookingsPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function VolunteerBookingsPage({
  searchParams,
}: VolunteerBookingsPageProps) {
  const params = await searchParams;

  return (
    <RoleGate allowedRoles={["volunteer"]}>
      <VolunteerBookingsContent message={params.message} error={params.error} />
    </RoleGate>
  );
}

async function VolunteerBookingsContent({
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

  const { data } = await supabase
    .from("bookings")
    .select(
      `
      *,
      opportunities (
        *,
        organizations (
          name
        )
      )
    `
    )
    .eq("volunteer_id", user!.id)
    .neq("status", "cancelled")
    .order("booked_at", { ascending: false });

  const bookings = (data || []) as BookingWithOpportunity[];
  const { data: scheduleNotifications } = await supabase
    .from("notifications")
    .select("opportunity_id")
    .eq("recipient_id", user!.id)
    .eq("type", "schedule_updated")
    .eq("status", "sent")
    .is("read_at", null)
    .is("archived_at", null);
  const changedOpportunityIds = new Set(
    (scheduleNotifications ?? [])
      .map((notification) => notification.opportunity_id)
      .filter(Boolean)
  );

  return (
    <section>
      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">My Bookings</h1>
        <p className="mt-2 text-slate-700">
          View and manage your current volunteer commitments.
        </p>
      </div>

      {message && <p className="alert-info mb-4">{message}</p>}
      {error && <p className="alert-error mb-4">{error}</p>}
      {changedOpportunityIds.size > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold">Schedule change</p>
          <p className="mt-1 text-sm">
            One or more of your bookings has a new date or time. Review the highlighted booking below.
          </p>
          <Link href="/notifications" className="mt-2 inline-flex text-sm font-semibold underline">
            View notification
          </Link>
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-slate-700">
            You do not have any active bookings yet.
          </p>
          <Link
            href="/opportunities"
            className="mt-4 inline-flex rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800"
          >
            Browse Opportunities
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const opportunity = booking.opportunities;
            const startDate = new Date(opportunity.start_at);
            const scheduleChanged = changedOpportunityIds.has(opportunity.id);

            return (
              <article
                key={booking.id}
                className={`rounded-xl border bg-white p-5 shadow-sm ${
                  scheduleChanged
                    ? "border-amber-400 ring-2 ring-amber-100"
                    : "border-transparent"
                }`}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    {scheduleChanged && (
                      <span className="mb-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                        Schedule changed
                      </span>
                    )}
                    <p className="text-sm font-medium text-emerald-700">
                      {opportunity.organizations?.name}
                    </p>

                    <h2 className="text-2xl font-semibold">
                      {opportunity.title}
                    </h2>

                    <p className="mt-2 text-slate-700">
                      {startDate.toLocaleDateString()} at{" "}
                      {startDate.toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>

                    <p className="text-slate-700">
                      {[opportunity.location_name, opportunity.city, opportunity.state]
                        .filter(Boolean)
                        .join(", ") || "Location TBD"}
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      Status: {booking.status}
                    </p>
                  </div>

                  <form action={cancelBooking}>
                    <input type="hidden" name="booking_id" value={booking.id} />
                    <SubmitButton
                      className="bg-red-700 hover:bg-red-800"
                      pendingText="Cancelling..."
                    >
                      Cancel Booking
                    </SubmitButton>
                  </form>
                </div>
                <AttendanceControls bookingId={booking.id} />
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
