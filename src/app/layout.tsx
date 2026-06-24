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
  // "cover" → true edge-to-edge so the installed PWA fills the screen like a native
  // app (background draws behind the system bars). Android 3-button nav reports
  // env(safe-area-inset-*)=0, so globals.css gives --safe-t / --safe-b a standalone
  // floor (status-bar / nav-bar height) to keep the header + TabBar clear of the OS
  // bars while the app background still extends edge-to-edge under them.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={cormorant.variable}>
      <body>{children}</body>
    </html>
  );
}
