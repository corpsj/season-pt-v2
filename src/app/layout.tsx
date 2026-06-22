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
  viewportFit: "cover",
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
