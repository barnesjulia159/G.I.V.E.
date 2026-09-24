"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function saveOrSendMessage(formData: FormData) {
  const recipientId = String(formData.get("recipient_id") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const submitAction = String(formData.get("submit_action") || "draft");

  if (!recipientId || !title || !message) {
    redirect("/notifications/new?error=Recipient, subject, and message are required.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: sender } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const { data: recipient } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", recipientId)
    .maybeSingle();

  const senderRole = sender?.role;
  const recipientRole = recipient?.role;
  const validPair =
    (senderRole === "volunteer" && recipientRole === "nonprofit") ||
    (senderRole === "nonprofit" && recipientRole === "volunteer");

  if (!validPair) {
    redirect("/notifications/new?error=Messages can only be sent between volunteers and nonprofits.");
  }

  const status = submitAction === "send" ? "sent" : "queued";

  await prisma.notification.create({
    data: {
      sender_id: user.id,
      recipient_id: recipientId,
      type: "message",
      title,
      message,
      status,
    },
  });

  redirect(
    status === "sent"
      ? "/notifications?message=Message sent."
      : "/notifications?message=Draft saved."
  );
}

export async function updateDraftMessage(formData: FormData) {
  const draftId = String(formData.get("draft_id") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const submitAction = String(formData.get("submit_action") || "save");

  if (!draftId || !title || !message) {
    redirect(`/notifications/${draftId}/edit?error=Subject and message are required.`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const draft = await prisma.notification.findFirst({
    where: { id: draftId, sender_id: user.id, status: "queued" },
  });

  if (!draft) {
    redirect("/notifications?message=That draft is no longer available.");
  }

  const status = submitAction === "send" ? "sent" : "queued";
  await prisma.notification.update({
    where: { id: draft.id },
    data: { title, message, status },
  });

  redirect(
    status === "sent"
      ? "/notifications?message=Message sent."
      : "/notifications?message=Draft updated."
  );
}

export async function archiveMessage(formData: FormData) {
  const messageId = String(formData.get("message_id") || "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!messageId) redirect("/notifications?message=Message not found.");

  const message = await prisma.notification.findFirst({
    where: {
      id: messageId,
      status: "sent",
      OR: [{ sender_id: user.id }, { recipient_id: user.id }],
    },
  });

  if (!message) redirect("/notifications?message=Message not found.");

  await prisma.notification.update({
    where: { id: message.id },
    data: { archived_at: new Date() },
  });

  redirect("/notifications?message=Message archived.");
}
