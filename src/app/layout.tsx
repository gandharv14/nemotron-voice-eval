import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GPU Endpoint Scheduler",
  description: "Reserve and schedule GPU endpoint sessions under a hard concurrency cap."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
