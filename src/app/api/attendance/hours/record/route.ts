import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const volunteerId = typeof body?.volunteerId === "string" ? body.volunteerId : body?.volunteer_id;
  const opportunityId = typeof body?.opportunityId === "string" ? body.opportunityId : body?.opportunity_id;
  const hours = typeof body?.hours === "number" ? body.hours : Number(body?.hours);
  const notes = typeof body?.notes === "string" ? body.notes.trim() : null;

  if (typeof volunteerId !== "string" || !volunteerId || typeof opportunityId !== "string" || !opportunityId) {
    return NextResponse.json({ message: "volunteerId and opportunityId are required" }, { status: 400 });
  }

  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return NextResponse.json({ message: "Hours must be greater than 0 and no more than 24" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "nonprofit") {
    return NextResponse.json({ message: "Only organizers and administrators can record hours" }, { status: 403 });
  }

  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { organization: { select: { user_id: true } } },
  });

  if (!opportunity || (profile.role !== "admin" && opportunity.organization.user_id !== user.id)) {
    return NextResponse.json({ message: "You can only record hours for your opportunities" }, { status: 403 });
  }

  const participant = await prisma.booking.findFirst({
    where: { opportunity_id: opportunityId, volunteer_id: volunteerId, status: { not: "cancelled" } },
    select: { id: true },
  });

  if (!participant) {
    return NextResponse.json({ message: "Volunteer is not an active participant in this opportunity" }, { status: 404 });
  }

  const attendance = await prisma.attendanceLog.findUnique({
    where: { booking_id: participant.id },
    select: { check_in_at: true, check_out_at: true },
  });

  if (attendance?.check_in_at && attendance.check_out_at) {
    return NextResponse.json(
      { message: "Hours are already derived from completed attendance for this booking" },
      { status: 409 }
    );
  }

  const hourEntry = await prisma.volunteer_hours.create({
    data: {
      volunteer_id: volunteerId,
      opportunity_id: opportunityId,
      recorded_by: user.id,
      hours,
      notes,
      recorded_at: new Date(),
      updated_at: new Date(),
    },
  });

  return NextResponse.json(hourEntry, { status: 201 });
}
