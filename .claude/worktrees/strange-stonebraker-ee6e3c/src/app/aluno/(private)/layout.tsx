"use client";

import { useState } from "react";
import AlunoGuard from "@/components/AlunoGuard";
import AlunoSidebar from "@/components/aluno/AlunoSidebar";
import AlunoTopHeader from "@/components/aluno/AlunoTopHeader";
import { AlunoThemeProvider } from "@/components/aluno/AlunoThemeProvider";
import { ToastProvider } from "@/components/ui/toast";
import { PageHeaderProvider } from "@/components/aluno/AlunoPageHeaderContext";
import { X } from "lucide-react";

export default function AlunoPrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <AlunoThemeProvider>
      <ToastProvider>
        <PageHeaderProvider>
          <AlunoGuard>
            <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(1300px_circle_at_18%_0%,rgba(15,23,42,0.08),transparent_55%),radial-gradient(950px_circle_at_100%_20%,rgba(2,132,199,0.10),transparent_45%)] dark:bg-[radial-gradient(1300px_circle_at_18%_0%,rgba(29,78,216,0.28),transparent_55%),radial-gradient(950px_circle_at_100%_20%,rgba(15,23,42,0.75),transparent_45%),linear-gradient(180deg,#020817_0%,#050d24_100%)]">
              <div className="flex min-h-screen">

                {/* Sidebar desktop */}
                <AlunoSidebar variant="desktop" />

                {/* Conteúdo */}
                <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
                  <AlunoTopHeader onMenuClick={() => setMobileOpen(true)} />

                  <main className="min-w-0 flex-1 overflow-x-hidden">
                    <div className="px-4 sm:px-6 lg:px-10 py-8">
                      <div className="mx-auto w-full max-w-[1200px]">
                        {children}
                      </div>
                    </div>
                  </main>
                </div>
              </div>

              {/* Drawer mobile */}
              {mobileOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                  <div
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={() => setMobileOpen(false)}
                  />

                  <div className="absolute left-0 top-0 flex h-full w-[85vw] max-w-[260px] flex-col bg-white shadow-2xl dark:bg-[#030b21]">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                          Anestesia Questões
                        </div>
                      </div>
                      <button
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-[#061738] dark:text-slate-300 dark:hover:bg-slate-800"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Fechar menu"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <AlunoSidebar
                        variant="drawer"
                        onNavigate={() => setMobileOpen(false)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AlunoGuard>
        </PageHeaderProvider>
      </ToastProvider>
    </AlunoThemeProvider>
  );
}
