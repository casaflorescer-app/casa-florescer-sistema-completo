import localFont from "next/font/local";

/**
 * Fontes empacotadas no repo — o build Docker/EasyPanel não depende de
 * fonts.googleapis.com (falha offline / VPS sem egress).
 */
export const nunito = localFont({
  src: [
    { path: "./Nunito-400.woff2", weight: "400", style: "normal" },
    { path: "./Nunito-500.woff2", weight: "500", style: "normal" },
    { path: "./Nunito-600.woff2", weight: "600", style: "normal" },
    { path: "./Nunito-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

export const playfair = localFont({
  src: [
    { path: "./PlayfairDisplay-500.woff2", weight: "500", style: "normal" },
    { path: "./PlayfairDisplay-600.woff2", weight: "600", style: "normal" },
    { path: "./PlayfairDisplay-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});
