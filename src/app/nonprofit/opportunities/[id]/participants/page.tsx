import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceRecorder } from "@/components/AttendanceRecorder";
import { ManualHoursRecorder } from "@/components/ManualHoursRecorder";
import { RoleGate } from "@/components/RoleGate";
import { createClient } from "@/lib/supabase/server";

type ParticipantsPageProps = {
  params: Promise<{ id: string }>;
};

type ParticipantBooking = {
  id: string;
  status: string;
  profiles: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  }[];
  attendance_logs: { status: string; recorded_at: string }[];
};

export default async function ParticipantsPage({ params }: ParticipantsPageProps) {
  const { id } = await params;

  return (
    <RoleGate allowedRoles={["nonprofit"]}>
      <ParticipantsContent opportunityId={id} />
    </RoleGate>
  );
}

async function ParticipantsContent({ opportunityId }: { opportunityId: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: organization } = await supabase
    .from("organizations")
    .select("id")
    .eq("user_id", user!.id)
    .maybeSingle();

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("id, title")
    .eq("id", opportunityId)
    .eq("organization_id", organization?.id ?? "")
    .maybeSingle();

  if (!opportunity) notFound();

  const { data } = await supabase
    .from("bookings")
    .select(
      `
      id,
      status,
      profiles (id, display_name, first_name, last_name),
      attendance_logs (status, recorded_at)
    `
    )
    .eq("opportunity_id", opportunityId)
    .neq("status", "cancelled")
    .order("booked_at", { ascending: true });

  const bookings = (data ?? []) as ParticipantBooking[];

  return (
    <section className="mx-auto max-w-4xl">
      <Link href="/nonprofit/dashboard" className="text-sm font-medium text-emerald-700 hover:underline">
        Back to dashboard
      </Link>
      <div className="mt-4 rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Participants</h1>
        <p className="mt-2 text-slate-700">{opportunity.title}</p>
      </div>

      <div className="mt-6 space-y-3">
        {bookings.length === 0 ? (
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <p className="text-slate-700">No active participants are registered.</p>
          </div>
        ) : (
          bookings.map((booking) => {
            const participant = booking.profiles?.[0];
            const name =
              participant?.display_name ||
              [participant?.first_name, participant?.last_name].filter(Boolean).join(" ") ||
              "Unknown participant";

            return (
              <article key={booking.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-5 shadow-sm">
                <div>
                  <h2 className="font-semibold text-slate-950">{name}</h2>
                  <p className="mt-1 text-sm capitalize text-slate-600">Booking: {booking.status}</p>
                  {booking.attendance_logs?.[0]?.recorded_at && (
                    <p className="mt-1 text-xs text-slate-500">
                      Recorded {new Date(booking.attendance_logs[0].recorded_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <AttendanceRecorder
                  bookingId={booking.id}
                  initialStatus={booking.attendance_logs?.[0]?.status}
                />
                <ManualHoursRecorder
                  volunteerId={participant?.id ?? ""}
                  opportunityId={opportunityId}
                />
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
