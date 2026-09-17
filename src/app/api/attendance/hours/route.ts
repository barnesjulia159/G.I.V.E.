import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

function calculateHours(checkIn: Date | null, checkOut: Date | null) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return 0;
  return (checkOut.getTime() - checkIn.getTime()) / 3_600_000;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requestedUserId = url.searchParams.get("userId");
  const opportunityId = url.searchParams.get("opportunityId");
  const targetUserId = requestedUserId || user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";

  if (requestedUserId && requestedUserId !== user.id && !isAdmin) {
    return NextResponse.json(
      { message: "You can only view your own logged hours" },
      { status: 403 }
    );
  }

  if (opportunityId && !isAdmin) {
    const { data: organization } = await supabase
      .from("organizations")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    const { data: opportunity } = await supabase
      .from("opportunities")
      .select("id")
      .eq("id", opportunityId)
      .eq("organization_id", organization?.id ?? "")
      .maybeSingle();

    if (!opportunity) {
      return NextResponse.json(
        { message: "You can only view hours for your opportunities" },
        { status: 403 }
      );
    }
  }

  const [bookings, manualHours] = await Promise.all([
    prisma.booking.findMany({
      where: opportunityId
        ? { opportunity_id: opportunityId, status: { not: "cancelled" } }
        : { volunteer_id: targetUserId, status: { not: "cancelled" } },
      orderBy: { booked_at: "desc" },
      include: {
        attendanceLog: true,
        opportunity: { select: { title: true } },
      },
    }),
    prisma.volunteer_hours.findMany({
      where: opportunityId
        ? { opportunity_id: opportunityId }
        : { volunteer_id: targetUserId },
      orderBy: { recorded_at: "desc" },
      include: { opportunities: { select: { title: true } } },
    }),
  ]);

  const data = [
    ...bookings.map((booking) => {
      const attendance = booking.attendanceLog;

      return {
        id: attendance?.id ?? booking.id,
        bookingId: booking.id,
        volunteerId: booking.volunteer_id,
        opportunityId: booking.opportunity_id,
        opportunityTitle: booking.opportunity.title,
        status: attendance?.status ?? booking.status,
        source: "attendance" as const,
        checkInAt: attendance?.check_in_at ?? null,
        checkOutAt: attendance?.check_out_at ?? null,
        recordedAt: attendance?.recorded_at ?? booking.booked_at,
        hours: calculateHours(attendance?.check_in_at ?? null, attendance?.check_out_at ?? null),
        notes: attendance?.notes ?? booking.notes,
      };
    }),
    ...manualHours.map((entry) => ({
      id: entry.id,
      bookingId: null,
      volunteerId: entry.volunteer_id,
      opportunityId: entry.opportunity_id,
      opportunityTitle: entry.opportunities.title,
      status: "manual",
      source: "manual" as const,
      checkInAt: null,
      checkOutAt: null,
      recordedAt: entry.recorded_at,
      hours: entry.hours,
      notes: entry.notes,
    })),
  ].sort((first, second) => second.recordedAt.getTime() - first.recordedAt.getTime());
  const totalHours = data.reduce((total, log) => total + log.hours, 0);

  return NextResponse.json({
    data,
    totalHours: Number(totalHours.toFixed(2)),
  });
}
