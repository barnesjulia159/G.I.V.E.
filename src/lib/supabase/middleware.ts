import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function getSupabaseKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseKey()!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Next.js can strip its prefetch headers in proxy, so use the browser's
  // fetch destination to distinguish document navigation from background requests.
  const destination = request.headers.get("sec-fetch-dest");
  const isHomeVisit = request.method === "GET" &&
    request.nextUrl.pathname === "/" &&
    (destination === "document" || destination === "iframe") &&
    !request.headers.has("next-router-prefetch") &&
    request.headers.get("purpose") !== "prefetch" &&
    !request.headers.get("sec-purpose")?.includes("prefetch");

  // Refreshes an expired access token so the user stays signed in.
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && isHomeVisit) {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        console.error("Home-page sign-out failed:", error);
        return new NextResponse("Sign-out could not be confirmed. Please reload to retry before using this device.", {
          status: 503,
          headers: { "Cache-Control": "private, no-store" },
        });
      }
      response.headers.set("Cache-Control", "private, no-store");
    }
  } catch (error) {
    if (isHomeVisit) {
      console.error("Home-page session verification or sign-out failed:", error);
      return new NextResponse("Your session could not be verified. Please reload to retry.", {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    // Network failures shouldn't block the request or clear the session.
  }

  return response;
}
