import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/SubmitButton";
import { saveOrSendMessage } from "@/lib/actions/messages";
import { createClient } from "@/lib/supabase/server";

type NewMessagePageProps = {
  searchParams: Promise<{ error?: string }>;
};

type Recipient = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

export default async function NewMessagePage({ searchParams }: NewMessagePageProps) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["volunteer", "nonprofit"].includes(profile.role)) {
    redirect("/notifications");
  }

  const recipientRole = profile.role === "volunteer" ? "nonprofit" : "volunteer";
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, first_name, last_name")
    .eq("role", recipientRole)
    .neq("id", user.id)
    .order("display_name");
  const recipients = (data ?? []) as Recipient[];

  return (
    <section className="mx-auto max-w-2xl rounded-xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">New message</h1>
          <p className="mt-2 text-slate-700">
            Message a {recipientRole === "volunteer" ? "volunteer" : "nonprofit"}.
          </p>
        </div>
        <Link href="/notifications" className="text-sm font-medium text-emerald-700 hover:underline">
          Back to messages
        </Link>
      </div>

      {error && <p className="alert-error mt-4">{error}</p>}

      <form action={saveOrSendMessage} className="mt-6 space-y-4">
        <div className="form-field">
          <label htmlFor="recipient_id" className="form-label">To</label>
          <select id="recipient_id" name="recipient_id" required className="form-input">
            <option value="">Choose a recipient</option>
            {recipients.map((recipient) => {
              const name =
                recipient.display_name ||
                [recipient.first_name, recipient.last_name].filter(Boolean).join(" ") ||
                "Unnamed user";
              return <option key={recipient.id} value={recipient.id}>{name}</option>;
            })}
          </select>
          {recipients.length === 0 && (
            <p className="text-sm text-slate-500">No eligible recipients are available.</p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="title" className="form-label">Subject</label>
          <input id="title" name="title" required maxLength={120} className="form-input" />
        </div>

        <div className="form-field">
          <label htmlFor="message" className="form-label">Message</label>
          <textarea id="message" name="message" required maxLength={5000} className="form-input min-h-40" />
        </div>

        <div className="flex flex-wrap gap-3">
          <SubmitButton name="submit_action" value="draft" className="bg-slate-700 hover:bg-slate-800">
            Save draft
          </SubmitButton>
          <SubmitButton name="submit_action" value="send" pendingText="Sending...">
            Send message
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
