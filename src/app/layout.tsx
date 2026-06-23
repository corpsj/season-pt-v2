import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "계절 PT & 필라테스",
  description: "균형 있게, 꾸준하게 — 계절 PT 트레이너·회원 앱",
  applicationName: "계절 PT",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "계절 PT" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#faf8f4",
  // NOTE: intentionally NOT "cover". On standalone PWAs, viewport-fit=cover draws
  // content edge-to-edge behind the system bars, but Android Chrome reports
  // env(safe-area-inset-bottom)=0 for 3-button navigation, so the bottom TabBar
  // ends up hidden behind the OS nav bar. Letting the UA inset the viewport keeps
  // the TabBar safely above the system navigation on every device.
  viewportFit: "auto",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${cormorant.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
