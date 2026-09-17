import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const bookingId = new URL(request.url).searchParams.get("bookingId");

  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!bookingId) return NextResponse.json({ message: "bookingId is required" }, { status: 400 });

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
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

  const body = await request.json().catch(() => null);
  const bookingId = typeof body?.bookingId === "string" ? body.bookingId : body?.booking_id;

  if (typeof bookingId !== "string" || !bookingId) {
    return NextResponse.json({ message: "bookingId is required" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, volunteer_id: true, status: true },
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
  const existing = await prisma.attendanceLog.findUnique({
    where: { booking_id: booking.id },
  });

  if (existing?.check_in_at) {
    return NextResponse.json(
      { message: existing.check_out_at ? "Attendance is already complete" : "Already checked in", attendance: existing },
      { status: 409 }
    );
  }

  const attendance = existing
    ? await prisma.attendanceLog.update({
        where: { id: existing.id },
        data: { status: "present", recorded_by: user.id, check_in_at: now },
      })
    : await prisma.attendanceLog.create({
        data: {
          booking_id: booking.id,
          recorded_by: user.id,
          status: "present",
          check_in_at: now,
        },
      });

  return NextResponse.json(attendance, { status: 201 });
}
