import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { AttendanceStatus } from "@/lib/types";

const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "present",
  "absent",
  "excused",
  "no_show",
];

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const bookingId = typeof body?.bookingId === "string" ? body.bookingId : body?.booking_id;
  const status = typeof body?.status === "string" ? body.status : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim() : null;

  if (typeof bookingId !== "string" || !bookingId) {
    return NextResponse.json({ message: "bookingId is required" }, { status: 400 });
  }

  if (!ATTENDANCE_STATUSES.includes(status as AttendanceStatus)) {
    return NextResponse.json({ message: "A valid attendance status is required" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "nonprofit") {
    return NextResponse.json({ message: "Only organizers and administrators can record attendance" }, { status: 403 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      opportunity: { select: { organization: { select: { user_id: true } } } },
    },
  });

  if (!booking || booking.status === "cancelled") {
    return NextResponse.json({ message: "Active booking not found" }, { status: 404 });
  }

  if (profile.role !== "admin" && booking.opportunity.organization.user_id !== user.id) {
    return NextResponse.json({ message: "You can only record attendance for your opportunities" }, { status: 403 });
  }

  const recordedAt = new Date();
  const attendance = await prisma.attendanceLog.upsert({
    where: { booking_id: booking.id },
    create: {
      booking_id: booking.id,
      recorded_by: user.id,
      status: status as AttendanceStatus,
      notes,
      recorded_at: recordedAt,
    },
    update: {
      recorded_by: user.id,
      status: status as AttendanceStatus,
      notes,
      recorded_at: recordedAt,
    },
  });

  return NextResponse.json(attendance, { status: 201 });
}
