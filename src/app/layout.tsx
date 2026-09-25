import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { InboxBadge } from "@/components/inbox-badge";
import { countNewFeedback } from "@/lib/feedback/service";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "KitForge",
  description: "Versioned Claude Code kits that improve from their own runs.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const inboxCount = countNewFeedback();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <header className="border-b border-border bg-card/60 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-8 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="grid size-6 place-items-center rounded-md bg-forge text-[11px] font-bold text-white">
                K
              </span>
              KitForge
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link data-testid="nav-library" href="/" className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                Library
              </Link>
              <Link
                data-testid="nav-inbox"
                href="/inbox"
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Feedback
                <Suspense fallback={null}>
                  <InboxBadge initial={inboxCount} />
                </Suspense>
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
