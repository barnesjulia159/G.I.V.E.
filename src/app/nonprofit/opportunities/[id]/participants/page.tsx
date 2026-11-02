import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceRecorder } from "@/components/AttendanceRecorder";
import { ManualCheckoutControl } from "@/components/ManualCheckoutControl";
import { HoursOverrideControl } from "@/components/HoursOverrideControl";
import { ManualHoursRecorder } from "@/components/ManualHoursRecorder";
import { LiveParticipants } from "@/components/LiveParticipants";
import { RoleGate } from "@/components/RoleGate";
import { prisma } from "@/lib/prisma";
import { requireNonprofitOrganization } from "@/lib/authorization";
import { LocalDateTime } from "@/components/LocalDateTime";

type ParticipantsPageProps = {
  params: Promise<{ id: string }>;
};

function calculateAttendanceHours(checkInAt: Date | null, checkOutAt: Date | null) {
  if (!checkInAt || !checkOutAt) return 0;
  const elapsed = checkOutAt.getTime() - checkInAt.getTime();
  return elapsed > 0 ? elapsed / 3_600_000 : 0;
}

export default async function ParticipantsPage({ params }: ParticipantsPageProps) {
  const { id } = await params;

  return (
    <RoleGate allowedRoles={["nonprofit"]}>
      <ParticipantsContent opportunityId={id} />
    </RoleGate>
  );
}

async function ParticipantsContent({ opportunityId }: { opportunityId: string }) {
  const { supabase, organization, user } = await requireNonprofitOrganization();

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("id, title")
    .eq("id", opportunityId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!opportunity) notFound();

  const bookings = await prisma.booking.findMany({
    where: {
      opportunity_id: opportunityId, opportunity: { organization: { user_id: user.id } },
      status: { not: "cancelled" },
    },
    orderBy: { booked_at: "asc" },
    select: {
      id: true,
      status: true,
      volunteer_id: true,
      attendanceLog: {
        select: {
          status: true,
          recorded_at: true,
          check_in_at: true,
          check_out_at: true,
        },
      },
    },
  });
  const participantProfiles = await prisma.profile.findMany({
    where: { id: { in: [...new Set(bookings.map((booking) => booking.volunteer_id))] } },
    select: { id: true, displayName: true, firstName: true, lastName: true, email: true },
  });
  const participantById = new Map(participantProfiles.map((profile) => [profile.id, profile]));
  let hoursOverrides = new Map<string, number>();
  try {
    const overrides = await prisma.booking.findMany({
      where: {
        opportunity_id: opportunityId, opportunity: { organization: { user_id: user.id } },
        status: { not: "cancelled" }, hours_override: { not: null },
      },
      select: { id: true, hours_override: true },
    });
    hoursOverrides = new Map(
      overrides.flatMap((booking) =>
        booking.hours_override === null ? [] : [[booking.id, booking.hours_override] as const]
      )
    );
  } catch (error) {
    console.error("Participant hours overrides could not be loaded:", error);
  }
  const manualHours = await prisma.volunteer_hours.findMany({
    where: { opportunity_id: opportunityId, opportunities: { organization: { user_id: user.id } } },
    select: { volunteer_id: true, hours: true },
  });
  const manualHoursByVolunteer = new Map<string, number>();
  for (const entry of manualHours) {
    manualHoursByVolunteer.set(
      entry.volunteer_id,
      (manualHoursByVolunteer.get(entry.volunteer_id) ?? 0) + entry.hours
    );
  }

  return (
    <section className="mx-auto max-w-4xl">
      <LiveParticipants />
      <Link href="/nonprofit/dashboard" className="text-sm font-medium text-emerald-700 hover:underline">
        Back to dashboard
      </Link>
      <div className="mt-4 rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Participants</h1>
        <p className="mt-2 text-slate-700">{opportunity.title}</p>
        <Link href={`/nonprofit/reports?event=${opportunityId}`} className="text-sm font-medium text-emerald-700 hover:underline">
          View event report
        </Link>
      </div>

      <div className="mt-6 space-y-3">
        {bookings.length === 0 ? (
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <p className="text-slate-700">No active participants are registered.</p>
          </div>
        ) : (
          bookings.map((booking) => {
            const participant = participantById.get(booking.volunteer_id);
            const name =
              participant?.displayName ||
              [participant?.firstName, participant?.lastName].filter(Boolean).join(" ") ||
              participant?.email ||
              "Volunteer profile unavailable";
            const attendance = booking.attendanceLog;
            const hoursOverride = hoursOverrides.get(booking.id) ?? null;
            const currentHours = hoursOverride ?? (
              calculateAttendanceHours(attendance?.check_in_at ?? null, attendance?.check_out_at ?? null) +
              (manualHoursByVolunteer.get(booking.volunteer_id) ?? 0)
            );

            return (
              <article key={booking.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-5 shadow-sm">
                <div>
                  <h2 className="font-semibold text-slate-950">{name}</h2>
                  <p className="mt-1 text-sm capitalize text-slate-600">Booking: {booking.status}</p>
                  <dl className="mt-2 space-y-1 text-sm text-slate-600">
                    <div className="flex flex-wrap gap-x-1">
                      <dt className="font-medium">Checked in:</dt>
                      <dd>
                        {attendance?.check_in_at
                          ? <LocalDateTime value={attendance.check_in_at} />
                          : "Not recorded"}
                      </dd>
                    </div>
                    <div className="flex flex-wrap gap-x-1">
                      <dt className="font-medium">Checked out:</dt>
                      <dd>
                        {attendance?.check_out_at
                          ? <LocalDateTime value={attendance.check_out_at} />
                          : "Not recorded"}
                      </dd>
                    </div>
                    {attendance?.recorded_at && (
                      <div className="flex flex-wrap gap-x-1 text-xs text-slate-500">
                        <dt>Attendance recorded:</dt>
                        <dd><LocalDateTime value={attendance.recorded_at} /></dd>
                      </div>
                    )}
                  </dl>
                </div>
                <AttendanceRecorder
                  bookingId={booking.id}
                  initialStatus={attendance?.status}
                />
                <ManualCheckoutControl
                  bookingId={booking.id}
                  initialCheckInAt={attendance?.check_in_at?.toISOString() ?? null}
                  initialCheckOutAt={attendance?.check_out_at?.toISOString() ?? null}
                />
                <ManualHoursRecorder
                  volunteerId={booking.volunteer_id}
                  opportunityId={opportunityId}
                />
                <HoursOverrideControl
                  bookingId={booking.id}
                  volunteerId={booking.volunteer_id}
                  opportunityId={opportunityId}
                  currentHours={currentHours}
                  hoursOverride={hoursOverride}
                />
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
