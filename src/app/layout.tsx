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
      <body>{children}</body>
    </html>
  );
}
