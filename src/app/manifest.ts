import type { MetadataRoute } from "next";
export const dynamic = "force-static";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kharcha — Expense Tracker",
    short_name: "Kharcha",
    description: "Everyday spending, made simple.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f8f2",
    theme_color: "#163f35",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
