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
  if (!bookingId || !body || !Object.prototype.hasOwnProperty.call(body, "hours")) {
    return NextResponse.json({ message: "bookingId and hours are required" }, { status: 400 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId)) {
    return NextResponse.json({ message: "bookingId must be a valid ID" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" && profile?.role !== "nonprofit") {
    return NextResponse.json({ message: "Only organizers and administrators can override hours" }, { status: 403 });
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
    return NextResponse.json({ message: "You can only override hours for your opportunities" }, { status: 403 });
  }

  const clearOverride = body.hours === null;
  const hours = typeof body.hours === "number" ? body.hours : null;
  if (!clearOverride && (hours === null || !Number.isFinite(hours) || hours < 0 || hours > 24)) {
    return NextResponse.json({ message: "Hours must be from 0 to 24" }, { status: 400 });
  }

  const notes = typeof body.notes === "string" ? body.notes.trim() : null;
  if (notes && notes.length > 1000) {
    return NextResponse.json({ message: "Notes must be 1000 characters or fewer" }, { status: 400 });
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      hours_override: hours,
      hours_override_notes: clearOverride ? null : notes,
      hours_override_by: clearOverride ? null : user.id,
      hours_override_at: clearOverride ? null : new Date(),
    },
    select: { id: true, hours_override: true, hours_override_at: true },
  });

  return NextResponse.json(updated);
}