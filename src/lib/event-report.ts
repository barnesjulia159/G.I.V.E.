type ReportBooking = {
  id: string;
  volunteer_id: string;
  status: string;
  hours_override: number | null;
  hours_override_notes: string | null;
  notes: string | null;
  attendanceLog: {
    status: string;
    check_in_at: Date | null;
    check_out_at: Date | null;
    notes: string | null;
  } | null;
};

type ManualEntry = { volunteer_id: string; hours: number; notes: string | null };
type ReportProfile = {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

export function buildEventReport(
  bookings: ReportBooking[],
  manualEntries: ManualEntry[],
  profiles: ReportProfile[]
) {
  const activeBookings = bookings.filter((booking) => booking.status !== "cancelled");
  const volunteerIds = new Set([
    ...activeBookings.map((booking) => booking.volunteer_id),
    ...manualEntries.map((entry) => entry.volunteer_id),
  ]);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const rows = [...volunteerIds].map((volunteerId) => {
    const profile = profileById.get(volunteerId);
    const sessions = activeBookings.filter((booking) => booking.volunteer_id === volunteerId);
    const entries = manualEntries.filter((entry) => entry.volunteer_id === volunteerId);
    const hasOverride = sessions.some((booking) => booking.hours_override !== null);
    let attendanceHours = 0;
    let overrideHours = 0;
    for (const booking of sessions) {
      if (booking.hours_override !== null) {
        overrideHours += booking.hours_override;
      } else {
        const checkIn = booking.attendanceLog?.check_in_at;
        const checkOut = booking.attendanceLog?.check_out_at;
        if (checkIn && checkOut && checkOut > checkIn) {
          attendanceHours += (checkOut.getTime() - checkIn.getTime()) / 3_600_000;
        }
      }
    }
    const manualHours = hasOverride ? 0 : entries.reduce((sum, entry) => sum + entry.hours, 0);
    const notes = [
      ...sessions.map((booking) => booking.hours_override_notes ?? booking.attendanceLog?.notes ?? booking.notes),
      ...(!hasOverride ? entries.map((entry) => entry.notes) : []),
    ].filter((note): note is string => Boolean(note));

    return {
      volunteerId,
      name: profile?.displayName || [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || profile?.email || "Volunteer profile unavailable",
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      sessions,
      attendanceHours,
      manualHours,
      overrideHours: hasOverride ? overrideHours : null,
      totalHours: attendanceHours + manualHours + overrideHours,
      notes,
    };
  }).sort((first, second) => first.name.localeCompare(second.name));

  return {
    rows,
    totalHours: rows.reduce((sum, row) => sum + row.totalHours, 0),
    volunteerCount: rows.length,
    checkedInCount: rows.filter((row) => row.sessions.some((booking) => booking.attendanceLog?.check_in_at && !booking.attendanceLog.check_out_at)).length,
  };
}