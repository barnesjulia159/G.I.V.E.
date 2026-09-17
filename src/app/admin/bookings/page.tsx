import { RoleGate } from "@/components/RoleGate";
import { AttendanceRecorder } from "@/components/AttendanceRecorder";
import { ManualHoursRecorder } from "@/components/ManualHoursRecorder";
import { createClient } from "@/lib/supabase/server";
import { Booking, Opportunity, Organization, Profile } from "@/lib/types";

type AdminBookingRow = Booking & {
  profiles: Pick<Profile, "display_name" | "first_name" | "last_name"> | null;
  opportunities:
    | (Pick<
        Opportunity,
        "title" | "start_at" | "city" | "state" | "location_name"
          | "id"
      > & {
        organizations: Pick<Organization, "name"> | null;
      })
    | null;
  attendance_logs: { status: string; recorded_at: string }[];
};

export default async function AdminBookingsPage() {
  return (
    <RoleGate allowedRoles={["admin"]}>
      <AdminBookingsContent />
    </RoleGate>
  );
}

async function AdminBookingsContent() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bookings")
    .select(
      `
      *,
      profiles (
        display_name,
        first_name,
        last_name
      ),
      opportunities (
        title,
        start_at,
        city,
        state,
        location_name,
        attendance_logs (
          status,
          recorded_at
        ),
        organizations (
          name
        )
      )
    `
    )
    .order("booked_at", { ascending: false });

  const bookings = (data || []) as AdminBookingRow[];

  return (
    <section>
      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Manage Bookings</h1>

        <p className="mt-2 text-slate-700">
          Review volunteer signups across the GIVE platform.
        </p>
      </div>

      {error && <p className="alert-error mb-4">{error.message}</p>}

      <div className="overflow-x-auto rounded-xl bg-white p-6 shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b text-slate-600">
              <th className="py-3 pr-4">Volunteer</th>
              <th className="py-3 pr-4">Opportunity</th>
              <th className="py-3 pr-4">Organization</th>
              <th className="py-3 pr-4">Date</th>
              <th className="py-3 pr-4">Location</th>
              <th className="py-3 pr-4">Status</th>
              <th className="py-3 pr-4">Booked</th>
              <th className="py-3 pr-4">Attendance</th>
            </tr>
          </thead>

          <tbody>
            {bookings.map((booking) => {
              const volunteerName =
                booking.profiles?.display_name ||
                [
                  booking.profiles?.first_name,
                  booking.profiles?.last_name,
                ]
                  .filter(Boolean)
                  .join(" ") ||
                "Unknown volunteer";

              const opportunity = booking.opportunities;

              return (
                <tr key={booking.id} className="border-b">
                  <td className="py-3 pr-4">{volunteerName}</td>

                  <td className="py-3 pr-4">
                    {opportunity?.title || "Unknown opportunity"}
                  </td>

                  <td className="py-3 pr-4">
                    {opportunity?.organizations?.name || "N/A"}
                  </td>

                  <td className="py-3 pr-4">
                    {opportunity?.start_at
                      ? new Date(opportunity.start_at).toLocaleDateString()
                      : "N/A"}
                  </td>

                  <td className="py-3 pr-4">
                    {opportunity
                      ? [opportunity.location_name, opportunity.city, opportunity.state]
                          .filter(Boolean)
                          .join(", ") || "N/A"
                      : "N/A"}
                  </td>

                  <td className="py-3 pr-4 capitalize">{booking.status}</td>

                  <td className="py-3 pr-4">
                    {new Date(booking.booked_at).toLocaleDateString()}
                  </td>

                  <td className="py-3 pr-4">
                    <AttendanceRecorder
                      bookingId={booking.id}
                      initialStatus={booking.attendance_logs?.[0]?.status}
                    />
                    {opportunity && (
                      <ManualHoursRecorder
                        volunteerId={booking.volunteer_id}
                        opportunityId={opportunity.id}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {bookings.length === 0 && (
          <p className="py-6 text-slate-700">No bookings were found.</p>
        )}
      </div>
    </section>
  );
}
