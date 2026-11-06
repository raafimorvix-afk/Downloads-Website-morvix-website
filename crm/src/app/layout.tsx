import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Morvix CRM", template: "%s · Morvix CRM" },
  description: "Lead, client and shift management for Morvix LLC",
  robots: { index: false, follow: false },
};

// Every CRM page depends on who is signed in, so pages render per request behind this loading state.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}
