import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import { archiveMessage } from "@/lib/actions/messages";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

type NotificationsPageProps = {
  searchParams: Promise<{ message?: string }>;
};

export default async function NotificationsPage({ searchParams }: NotificationsPageProps) {
  const { message: statusMessage } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Messages</h1>
        <p className="mt-2 text-slate-700">Sign in to view your messages.</p>
      </section>
    );
  }

  const received = await prisma.notification.findMany({
    where: { recipient_id: user.id, status: "sent", archived_at: null },
    orderBy: { created_at: "desc" },
    take: 50,
  });
  const sent = await prisma.notification.findMany({
    where: { sender_id: user.id, status: "sent", archived_at: null },
    orderBy: { created_at: "desc" },
    take: 50,
  });
  const drafts = await prisma.notification.findMany({
    where: { sender_id: user.id, status: "queued" },
    orderBy: { created_at: "desc" },
    take: 50,
  });
  const archived = await prisma.notification.findMany({
    where: {
      status: "sent",
      archived_at: { not: null },
      OR: [{ sender_id: user.id }, { recipient_id: user.id }],
    },
    orderBy: { archived_at: "desc" },
    take: 50,
  });

  return (
    <section className="mx-auto max-w-3xl">
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Messages</h1>
        <p className="mt-2 text-slate-700">Updates about your volunteer activity.</p>
        {statusMessage && <p className="alert-info mt-4">{statusMessage}</p>}
        <Link
          href="/notifications/new"
          className="mt-5 inline-flex rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800"
        >
          New message
        </Link>
      </div>

      <MessageSection title="Received" messages={received} showArchive />
      <MessageSection title="Sent" messages={sent} showArchive />

      {drafts.length > 0 && (
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Drafts</h2>
          <ul className="mt-3 space-y-2">
            {drafts.map((draft) => (
              <li key={draft.id} className="border-b border-slate-100 pb-2 text-slate-700">
                <Link
                  href={`/notifications/${draft.id}/edit`}
                  className="font-medium text-emerald-700 hover:underline"
                >
                  {draft.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <MessageSection title="Archived" messages={archived} />
    </section>
  );
}

type MessageSectionProps = {
  title: string;
  messages: Array<{
    id: string;
    opportunity_id: string | null;
    type: string;
    title: string;
    message: string;
    read_at: Date | null;
    created_at: Date;
  }>;
  showArchive?: boolean;
};

function MessageSection({ title, messages, showArchive = false }: MessageSectionProps) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      {messages.length === 0 ? (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-slate-700">No {title.toLowerCase()} messages.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((notification) => (
            <article
              key={notification.id}
              className={`rounded-xl border bg-white p-5 shadow-sm ${
                notification.type === "schedule_updated"
                  ? "border-amber-400 bg-amber-50/40"
                  : notification.read_at
                    ? "border-slate-200"
                    : "border-emerald-300"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  {notification.type === "schedule_updated" && (
                    <span className="mb-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
                      Schedule change
                    </span>
                  )}
                  <h3 className="font-semibold text-slate-950">{notification.title}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700">{notification.message}</p>
                  {notification.opportunity_id && (
                    <Link
                      href={`/opportunities/${notification.opportunity_id}`}
                      className="mt-3 inline-flex text-sm font-semibold text-emerald-700 hover:underline"
                    >
                      View opportunity and register
                    </Link>
                  )}
                </div>
                {!notification.read_at && (
                  <span className="shrink-0 text-xs font-semibold text-emerald-700">New</span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-4">
                <p className="text-xs text-slate-500">
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(notification.created_at)}
                </p>
                {showArchive && (
                  <form action={archiveMessage}>
                    <input type="hidden" name="message_id" value={notification.id} />
                    <SubmitButton
                      className="bg-slate-600 px-3 py-1 text-xs hover:bg-slate-700"
                      pendingText="Archiving..."
                    >
                      Archive
                    </SubmitButton>
                  </form>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
