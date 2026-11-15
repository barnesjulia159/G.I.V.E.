import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfile } from "@/lib/authorization";
import { isActiveRole } from "@/lib/access-control";
import { SELF_CHECK_IN_EARLY_MS } from "@/lib/attendance";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!isActiveRole(await getActiveProfile(user.id), ["volunteer"])) {
    return NextResponse.json({ message: "An active volunteer account is required" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const bookingId = typeof body?.bookingId === "string" ? body.bookingId : body?.booking_id;

  if (typeof bookingId !== "string" || !bookingId) {
    return NextResponse.json({ message: "bookingId is required" }, { status: 400 });
  }

  const attendance = await prisma.attendanceLog.findFirst({
    where: { booking_id: bookingId, booking: { volunteer_id: user.id } },
    include: { booking: { select: {
      volunteer_id: true, status: true,
      opportunity: { select: { start_at: true, end_at: true, is_deleted: true } },
    } } },
  });

  if (!attendance || attendance.booking.volunteer_id !== user.id) {
    return NextResponse.json({ message: "Attendance record not found" }, { status: 404 });
  }

  if (!attendance.check_in_at) {
    return NextResponse.json(
      { message: "Check in before checking out" },
      { status: 409 }
    );
  }

  if (attendance.check_out_at) {
    return NextResponse.json(
      { message: "Already checked out", attendance },
      { status: 409 }
    );
  }

  if (attendance.verified_at || attendance.booking.status !== "booked" || attendance.booking.opportunity.is_deleted) {
    return NextResponse.json({ message: "This attendance cannot be changed by the volunteer. Contact the organizer." }, { status: 409 });
  }
  const now = new Date();
  const opportunity = attendance.booking.opportunity;
  if (now < opportunity.start_at) {
    return NextResponse.json({ message: "Check-out is available once the event starts." }, { status: 409 });
  }
  const checkOutAt = new Date(Math.min(now.getTime(), opportunity.end_at.getTime()));
  if (attendance.check_in_at.getTime() < opportunity.start_at.getTime() - SELF_CHECK_IN_EARLY_MS || checkOutAt <= attendance.check_in_at) {
    return NextResponse.json({ message: "Session times must fall within the event. Contact the organizer for corrections." }, { status: 409 });
  }
  const [updated] = await prisma.attendanceLog.updateManyAndReturn({
    where: { id: attendance.id, check_in_at: attendance.check_in_at, check_out_at: null, verified_at: null },
    data: { check_out_at: checkOutAt, status: "present", verified_at: null, verified_by: null },
  });

  if (!updated) {
    return NextResponse.json({ message: "Attendance changed. Reload before checking out." }, { status: 409 });
  }
  return NextResponse.json(updated);
}
