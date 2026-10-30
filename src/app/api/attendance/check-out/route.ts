import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfile } from "@/lib/authorization";
import { isActiveRole } from "@/lib/access-control";

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
    include: { booking: { select: { volunteer_id: true } } },
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

  const updated = await prisma.attendanceLog.update({
    where: { id: attendance.id },
    data: { check_out_at: new Date(), status: "present" },
  });

  return NextResponse.json(updated);
}
