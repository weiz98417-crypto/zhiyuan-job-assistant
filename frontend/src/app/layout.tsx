import type { Metadata } from "next";
import { Noto_Sans_SC } from "next/font/google";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import AppShell from "@/components/shell/AppShell";
import "./globals.css";

const notoSansSC = Noto_Sans_SC({
  weight: ["400", "500", "700"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "筝筝纸鸢 — AI 求职助手",
  description: "一个有温度的 AI 求职引擎——让求职从焦虑变掌控",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${notoSansSC.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* LXGW WenKai via Google Fonts CDN — the handwriting display font */}
        <link
          href="https://fonts.googleapis.com/css2?family=LXGW+WenKai:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
