// src/components/aluno/AlunoShell.tsx
"use client";

import React from "react";

export default function AlunoShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      {(title || subtitle || actions) && (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500">Área do Aluno</div>

            {title ? (
              <h1 className="mt-1 text-2xl sm:text-3xl font-black text-slate-900 truncate">
                {title}
              </h1>
            ) : null}

            {subtitle ? (
              <p className="mt-1 text-sm sm:text-base text-slate-600 truncate">
                {subtitle}
              </p>
            ) : null}
          </div>

          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
      )}

      <div className="min-w-0">{children}</div>
    </section>
  );
}