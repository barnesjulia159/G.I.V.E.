import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export async function consumeLoginAttempt(email: string) {
  const key = createHash("sha256").update(`login:${email.trim().toLowerCase()}`).digest("hex");
  const [result] = await prisma.$transaction(async (tx) => {
    // Expired keys have no security value. Bound cleanup work per login.
    await tx.$executeRaw`
      DELETE FROM public.login_rate_limits
      WHERE key_hash IN (
        SELECT key_hash FROM public.login_rate_limits
        WHERE expires_at < now() - interval '1 day'
        ORDER BY expires_at LIMIT 100
        FOR UPDATE SKIP LOCKED
      )
    `;
    return tx.$queryRaw<{ allowed: boolean; retry_after: number }[]>`
      INSERT INTO public.login_rate_limits (key_hash, attempts, expires_at)
      VALUES (${key}, 1, now() + interval '15 minutes')
      ON CONFLICT (key_hash) DO UPDATE SET
        attempts = CASE WHEN login_rate_limits.expires_at <= now() THEN 1
          ELSE least(login_rate_limits.attempts + 1, 11) END,
        expires_at = CASE WHEN login_rate_limits.expires_at <= now()
          THEN now() + interval '15 minutes' ELSE login_rate_limits.expires_at END
      RETURNING attempts <= 10 AS allowed,
        greatest(1, ceil(extract(epoch from (expires_at - now())))::integer) AS retry_after
    `;
  });
  if (!result) throw new Error("Login rate limit returned no result.");
  return result;
}
