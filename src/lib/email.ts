function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

type BookingConfirmationEmail = {
  to: string;
  volunteerName: string;
  opportunityTitle: string;
  startAt: string;
  location: string;
};

export async function sendBookingConfirmationEmail({
  to,
  volunteerName,
  opportunityTitle,
  startAt,
  location,
}: BookingConfirmationEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn("Booking confirmation email skipped: Resend environment variables are missing.");
    return false;
  }

  const safeTitle = escapeHtml(opportunityTitle);
  const safeName = escapeHtml(volunteerName);
  const safeStart = escapeHtml(startAt);
  const safeLocation = escapeHtml(location);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Booking confirmed: ${opportunityTitle}`,
      html: `<h2>Booking confirmed</h2><p>Hi ${safeName},</p><p>Your volunteer booking for <strong>${safeTitle}</strong> is confirmed.</p><p><strong>When:</strong> ${safeStart}<br /><strong>Where:</strong> ${safeLocation}</p><p>We look forward to seeing you there.</p>`,
    }),
  });

  if (!response.ok) {
    console.error("Booking confirmation email failed:", await response.text());
    return false;
  }

  return true;
}
