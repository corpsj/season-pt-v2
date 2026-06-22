import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "계절 PT & 필라테스",
    short_name: "계절 PT",
    description: "균형 있게, 꾸준하게 — 계절 PT 트레이너·회원 앱",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAF8F4",
    theme_color: "#FAF8F4",
    icons: [
      { src: "/brand/brand-mark.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/brand-mark.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/brand-mark.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
