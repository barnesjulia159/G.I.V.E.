import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { updateDraftMessage } from "@/lib/actions/messages";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

type EditDraftPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function EditDraftPage({
  params,
  searchParams,
}: EditDraftPageProps) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const draft = await prisma.notification.findFirst({
    where: { id, sender_id: user.id, status: "queued" },
    include: {
      recipient: {
        select: { displayName: true, firstName: true, lastName: true },
      },
    },
  });

  if (!draft) redirect("/notifications?message=That draft is no longer available.");

  const recipientName =
    draft.recipient.displayName ||
    [draft.recipient.firstName, draft.recipient.lastName].filter(Boolean).join(" ") ||
    "Selected recipient";

  return (
    <section className="mx-auto max-w-2xl rounded-xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Edit draft</h1>
          <p className="mt-2 text-slate-700">To: {recipientName}</p>
        </div>
        <Link href="/notifications" className="text-sm font-medium text-emerald-700 hover:underline">
          Back to messages
        </Link>
      </div>

      {error && <p className="alert-error mt-4">{error}</p>}

      <form action={updateDraftMessage} className="mt-6 space-y-4">
        <input type="hidden" name="draft_id" value={draft.id} />

        <div className="form-field">
          <label htmlFor="title" className="form-label">Subject</label>
          <input id="title" name="title" required maxLength={120} defaultValue={draft.title} className="form-input" />
        </div>

        <div className="form-field">
          <label htmlFor="message" className="form-label">Message</label>
          <textarea id="message" name="message" required maxLength={5000} defaultValue={draft.message} className="form-input min-h-40" />
        </div>

        <div className="flex flex-wrap gap-3">
          <SubmitButton name="submit_action" value="save" className="bg-slate-700 hover:bg-slate-800">
            Save changes
          </SubmitButton>
          <SubmitButton name="submit_action" value="send" pendingText="Sending...">
            Send message
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
