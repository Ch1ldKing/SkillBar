import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillBar Online",
  description: "把 TA 的 SKILL 拉进来聊聊吧~",
  icons: {
    icon: "/icon",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
