import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const bookingId = typeof body?.bookingId === "string" ? body.bookingId : "";
  const checkInAt = typeof body?.checkInAt === "string" ? new Date(body.checkInAt) : null;
  const checkOutAt = typeof body?.checkOutAt === "string" ? new Date(body.checkOutAt) : null;

  if (!bookingId || !checkInAt || !checkOutAt || Number.isNaN(checkInAt.getTime()) || Number.isNaN(checkOutAt.getTime())) {
    return NextResponse.json({ message: "A booking, check-in time, and check-out time are required" }, { status: 400 });
  }

  const duration = checkOutAt.getTime() - checkInAt.getTime();
  if (duration <= 0 || duration > 24 * 60 * 60 * 1000 || checkOutAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return NextResponse.json({ message: "Check-out must be after check-in, within 24 hours, and not in the future" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "nonprofit") {
    return NextResponse.json({ message: "Only organizers and administrators can set session times" }, { status: 403 });
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
    return NextResponse.json({ message: "Active participant booking not found" }, { status: 404 });
  }

  if (profile.role !== "admin" && booking.opportunity.organization.user_id !== user.id) {
    return NextResponse.json({ message: "You can only update session times for your opportunities" }, { status: 403 });
  }

  const attendance = await prisma.attendanceLog.upsert({
    where: { booking_id: booking.id },
    create: {
      booking_id: booking.id,
      recorded_by: user.id,
      status: "present",
      check_in_at: checkInAt,
      check_out_at: checkOutAt,
    },
    update: {
      recorded_by: user.id,
      status: "present",
      check_in_at: checkInAt,
      check_out_at: checkOutAt,
    },
  });

  return NextResponse.json(attendance);
}