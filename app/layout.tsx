import type { Metadata } from "next";
import "./globals.css";
import InstallPrompt from "./components/InstallPrompt";

export const metadata: Metadata = {
  title: "AMCC | Agri Loan Tracker",
  description: "A shared workspace for agricultural loan sourcing and renewals across thirteen branches.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AMCC Loans", statusBarStyle: "default" },
  // Next only emits the unprefixed tag; older iOS needs this one to open the home-screen app full screen.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: "/favicon.svg",
    apple: "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}<InstallPrompt /></body>
    </html>
  );
}
