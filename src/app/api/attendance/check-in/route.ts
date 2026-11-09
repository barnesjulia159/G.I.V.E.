import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfile } from "@/lib/authorization";
import { isActiveRole } from "@/lib/access-control";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const bookingId = new URL(request.url).searchParams.get("bookingId");

  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isActiveRole(await getActiveProfile(user.id), ["volunteer"])) {
    return NextResponse.json({ message: "An active volunteer account is required" }, { status: 403 });
  }
  if (!bookingId) return NextResponse.json({ message: "bookingId is required" }, { status: 400 });

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, volunteer_id: user.id },
    select: { volunteer_id: true },
  });
  if (!booking || booking.volunteer_id !== user.id) {
    return NextResponse.json({ message: "Booking not found" }, { status: 404 });
  }

  const attendance = await prisma.attendanceLog.findUnique({ where: { booking_id: bookingId } });
  return NextResponse.json(attendance ?? { check_in_at: null, check_out_at: null });
}

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

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, volunteer_id: user.id },
    select: {
      id: true, volunteer_id: true, status: true,
      opportunity: { select: { start_at: true, end_at: true, status: true, is_deleted: true } },
    },
  });

  if (!booking || booking.volunteer_id !== user.id) {
    return NextResponse.json({ message: "Booking not found" }, { status: 404 });
  }

  if (booking.status !== "booked") {
    return NextResponse.json(
      { message: "Only booked opportunities can be checked in" },
      { status: 409 }
    );
  }

  const now = new Date();
  if (booking.opportunity.is_deleted || booking.opportunity.status !== "published" ||
    now < booking.opportunity.start_at || now >= booking.opportunity.end_at) {
    return NextResponse.json({ message: "Self check-in is available only during the published event. Contact the organizer for corrections." }, { status: 409 });
  }
  const existing = await prisma.attendanceLog.findUnique({
    where: { booking_id: booking.id },
  });

  if (existing?.check_in_at || existing?.verified_at) {
    return NextResponse.json(
      { message: existing.check_out_at ? "Attendance is already complete" : "Already checked in", attendance: existing },
      { status: 409 }
    );
  }

  if (existing) {
    const [attendance] = await prisma.attendanceLog.updateManyAndReturn({
      where: { id: existing.id, check_in_at: null, check_out_at: null, verified_at: null },
      data: { status: "present", recorded_by: user.id, check_in_at: now, verified_at: null, verified_by: null },
    });
    if (!attendance) {
      return NextResponse.json({ message: "Attendance changed. Reload before checking in." }, { status: 409 });
    }
    return NextResponse.json(attendance, { status: 201 });
  }

  try {
    const attendance = await prisma.attendanceLog.create({
        data: {
          booking_id: booking.id,
          recorded_by: user.id,
          status: "present",
          check_in_at: now,
        },
    });
    return NextResponse.json(attendance, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return NextResponse.json({ message: "Attendance changed. Reload before checking in." }, { status: 409 });
    }
    throw error;
  }
}
