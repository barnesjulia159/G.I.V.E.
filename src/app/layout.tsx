import type { Metadata } from "next";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";
import { AuthSessionBoundary } from "@/components/AuthSessionBoundary";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "GIVE Volunteering Platform",
  description: "GIVE: Get Involved. Volunteer Easily.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <AuthSessionBoundary key={user?.id ?? "anonymous"} userId={user?.id ?? null}>
          <AppHeader />
          <main
            id="main-content"
            tabIndex={-1}
            className="app-shell"
          >
            {children}
          </main>
        </AuthSessionBoundary>
      </body>
    </html>
  );
}
