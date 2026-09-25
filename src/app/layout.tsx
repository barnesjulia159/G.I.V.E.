import type { Metadata } from "next";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "GIVE Volunteering Platform",
  description: "GIVE: Get Involved. Volunteer Easily.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <AppHeader />
        <main className="app-shell mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
