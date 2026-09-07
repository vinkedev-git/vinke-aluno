import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import StagingBanner from "@/components/StagingBanner";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vinke | Portal do Aluno",
  description: "Questões, simulados e estatísticas para você evoluir até o ENEM.",
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
        className={`${manrope.variable} ${spaceGrotesk.variable} font-sans antialiased`}
      >
        <StagingBanner />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
