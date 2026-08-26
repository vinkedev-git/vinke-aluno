"use client";

import { useState } from "react";
import AlunoGuard from "@/components/AlunoGuard";
import AlunoSidebar from "@/components/aluno/AlunoSidebar";
import AlunoBottomNav from "@/components/aluno/AlunoBottomNav";
import AlunoTopHeader from "@/components/aluno/AlunoTopHeader";
import { AlunoThemeProvider } from "@/components/aluno/AlunoThemeProvider";
import { ToastProvider } from "@/components/ui/toast";
import { PageHeaderProvider } from "@/components/aluno/AlunoPageHeaderContext";
import ErrorBoundary from "@/components/ErrorBoundary";
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
            <div className="min-h-screen overflow-x-hidden bg-vinke-offwhite dark:bg-vinke-navy">
              <div className="flex min-h-screen">

                {/* Sidebar desktop */}
                <AlunoSidebar variant="desktop" />

                {/* Conteúdo */}
                <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
                  <AlunoTopHeader onMenuClick={() => setMobileOpen(true)} />

                  <main className="min-w-0 flex-1 overflow-x-hidden pb-16 lg:pb-0">
                    <div className="px-4 sm:px-6 lg:px-10 py-8">
                      <div className="mx-auto w-full max-w-[1200px]">
                        <ErrorBoundary>{children}</ErrorBoundary>
                      </div>
                    </div>
                  </main>
                </div>
              </div>

              {/* Navegação inferior mobile */}
              <AlunoBottomNav onMenuClick={() => setMobileOpen(true)} />

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
                          Vinke
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
