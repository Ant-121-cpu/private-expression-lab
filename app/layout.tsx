import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "表达训练台",
  description: "每日视频日记表达训练与冗余词教练系统"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
