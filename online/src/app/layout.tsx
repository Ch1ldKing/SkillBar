import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillBar Online",
  description: "Online SkillBar group chat with optional login.",
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
