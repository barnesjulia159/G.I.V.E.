import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  _request: Request,
  { params }: RouteContext<"/api/notifications/[id]/read">
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const notification = await prisma.notification.findFirst({
    where: { id, recipient_id: user.id },
  });

  if (!notification) {
    return NextResponse.json({ message: "Notification not found" }, { status: 404 });
  }

  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data: { read_at: notification.read_at ?? new Date() },
  });

  return NextResponse.json(updated);
}
