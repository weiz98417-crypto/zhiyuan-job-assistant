import type { Metadata } from "next";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import AuthGate from "@/components/shell/AuthGate";
import "./globals.css";

export const metadata: Metadata = {
  title: "纸鸢 Agent — AI 求职助手",
  description: "让每一份认真，都走向更大的机会",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        {/* LXGW WenKai via Google Fonts CDN — the handwriting display font */}
        <link
          href="https://fonts.googleapis.com/css2?family=LXGW+WenKai:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full overflow-x-hidden">
        <ThemeProvider>
          <AuthGate>{children}</AuthGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
