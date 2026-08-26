import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import StagingBanner from "@/components/StagingBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vinke | Portal do Aluno",
  description: "Portal do aluno para simulados, desempenho e acompanhamento de estudos em anestesiologia.",
  icons: {
    icon: [{ url: "/logo-icon.png", type: "image/png" }],
    shortcut: "/logo-icon.png",
    apple: "/logo-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        {/*
          Aplica o tema antes do primeiro paint para evitar "flash" entre claro/escuro.
          - Paginas publicas (login, redefinir senha): SEMPRE modo claro
          - Paginas privadas (apos login): respeita preferencia salva pelo aluno
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var path = window.location.pathname || "";
                var isPublicPage =
                  path === "/" ||
                  path.includes("/aluno/entrar") ||
                  path.includes("/aluno/redefinir-senha");

                var theme = "light";
                if (!isPublicPage) {
                  var saved = localStorage.getItem("vinke.aluno.theme");
                  if (saved === "dark" || saved === "light") theme = saved;
                }

                document.documentElement.dataset.theme = theme;
                if (theme === "dark") {
                  document.documentElement.classList.add("dark");
                } else {
                  document.documentElement.classList.remove("dark");
                }
              } catch (e) {
                document.documentElement.dataset.theme = "light";
              }
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <StagingBanner />
        {children}
      </body>
    </html>
  );
}
