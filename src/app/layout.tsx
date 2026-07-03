import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { SafeAreaInsets } from "@/components/shell/SafeAreaInsets";
import { InstallPrompt } from "@/components/shell/InstallPrompt";
import { ServiceWorkerRegister } from "@/components/shell/ServiceWorkerRegister";
import { OfflineBanner } from "@/components/shell/OfflineBanner";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const OG_DESC = "아이폰은 Safari, 안드로이드는 Chrome으로 열어 ‘설치’하세요. 홈 화면에서 앱처럼 빠르게 이용해요.";

export const metadata: Metadata = {
  metadataBase: new URL("https://season-pt.vercel.app"),
  title: "계절 PT & 필라테스",
  description: "균형 있게, 꾸준하게 — 계절 PT 트레이너·회원 앱",
  applicationName: "계절 PT",
  // MEASURED iPhone 15 Pro standalone: the webview is inset BELOW the status bar
  // (env-top 0, innerHeight 793 = screen 852 − 59). iOS owns that bar; web content
  // can't paint it. "default" makes iOS render it matching the SYSTEM appearance —
  // light bar + dark text in Light Mode (matches the cream app), dark bar in Dark Mode.
  // "black-translucent" forced it solid BLACK, so the notch read as black. (True
  // under-notch fullscreen would need dropping the manifest display mode → breaks
  // Android install + forces a permanently white, low-contrast clock.)
  appleWebApp: { capable: true, statusBarStyle: "default", title: "계절 PT" },
  // Next 16 emits only the generic `mobile-web-app-capable` for capable:true. iOS
  // honors statusBarStyle ONLY when the apple-prefixed tag is present — without it
  // black-translucent is ignored and the notch stays black. Inject it explicitly.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "계절 PT & 필라테스",
    title: "계절 PT & 필라테스 · 앱 설치",
    description: OG_DESC,
    url: "https://season-pt.vercel.app",
    locale: "ko_KR",
    images: [
      { url: "/brand/og.png", width: 1200, height: 630, alt: "계절 PT & 필라테스 앱 설치 안내" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "계절 PT & 필라테스 · 앱 설치",
    description: OG_DESC,
    images: ["/brand/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 확대(핀치 줌)를 막지 않는다 — 중장년 회원이 작은 글씨를 키울 수 있어야 한다(감사 low, 접근성).
  maximumScale: 5,
  userScalable: true,
  colorScheme: "light",
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
      <body>
        <SafeAreaInsets />
        <OfflineBanner />
        <ServiceWorkerRegister />
        <InstallPrompt />
        {children}
      </body>
    </html>
  );
}
