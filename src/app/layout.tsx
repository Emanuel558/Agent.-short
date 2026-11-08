import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AutoTube AI · Your next great video starts here",
  description:
    "A focused workspace for original video ideas, scripts, and scene planning. Phase 1.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      {/* Grammarly and similar extensions can add body attributes before hydration.
          Limit this escape hatch to body; descendant mismatches still surface. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
