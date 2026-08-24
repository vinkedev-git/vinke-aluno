"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { CheckCircle, Eye, EyeOff, Lock, XCircle } from "lucide-react";

type Stage = "loading" | "form" | "success" | "error";

function RedefinirSenhaContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const oobCode = searchParams.get("oobCode") ?? "";

  const [stage, setStage] = useState<Stage>("loading");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Verifica se o código é válido ao montar
  useEffect(() => {
    if (!oobCode) {
      setStage("error");
      setErrorMsg("Link inválido ou expirado. Solicite um novo link de redefinição.");
      return;
    }

    verifyPasswordResetCode(auth, oobCode)
      .then((userEmail) => {
        setEmail(userEmail);
        setStage("form");
      })
      .catch(() => {
        setStage("error");
        setErrorMsg("Este link já foi usado ou expirou. Solicite um novo link de redefinição.");
      });
  }, [oobCode]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (senha.length < 6) {
      setErrorMsg("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirmar) {
      setErrorMsg("As senhas não coincidem.");
      return;
    }

    setSaving(true);
    try {
      await confirmPasswordReset(auth, oobCode, senha);
      setStage("success");
    } catch {
      setErrorMsg("Não foi possível redefinir a senha. O link pode ter expirado. Solicite um novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_20%_0%,rgba(56,189,248,0.16),transparent_45%),radial-gradient(1000px_circle_at_100%_20%,rgba(37,99,235,0.20),transparent_42%),linear-gradient(180deg,#020817_0%,#071235_100%)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl shadow-lg">
            <Image src="/logo-icon.png" alt="Vinke" width={56} height={56} />
          </div>
          <span className="text-sm font-semibold tracking-widest text-blue-300/80 uppercase">
            Vinke
          </span>
        </div>

        <div className="rounded-3xl border border-blue-200/15 bg-white/95 shadow-[0_25px_80px_rgba(2,6,23,0.45)] backdrop-blur dark:border-blue-300/20 dark:bg-[#020b23]/90">
          <div className="p-8">

            {/* Loading */}
            {stage === "loading" && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
                <p className="text-sm text-slate-500">Verificando link...</p>
              </div>
            )}

            {/* Form */}
            {stage === "form" && (
              <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                    Nova senha
                  </h1>
                  {email && (
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Conta: <span className="font-medium text-slate-700 dark:text-slate-300">{email}</span>
                    </p>
                  )}
                </div>

                {errorMsg && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
                    <XCircle size={16} className="mt-0.5 shrink-0" />
                    {errorMsg}
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Nova senha
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showSenha ? "text" : "password"}
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSenha((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Confirmar senha
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showConfirmar ? "text" : "password"}
                      value={confirmar}
                      onChange={(e) => setConfirmar(e.target.value)}
                      placeholder="Repita a nova senha"
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmar((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showConfirmar ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-gradient-to-r from-blue-700 to-blue-500 py-3 text-sm font-bold text-white shadow-md transition hover:from-blue-600 hover:to-blue-400 disabled:opacity-60"
                >
                  {saving ? "Salvando..." : "Definir nova senha"}
                </button>
              </form>
            )}

            {/* Success */}
            {stage === "success" && (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40">
                  <CheckCircle size={36} className="text-emerald-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Senha redefinida!
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Sua senha foi alterada com sucesso. Faça login com a nova senha.
                </p>
                <button
                  onClick={() => router.replace("/aluno/entrar")}
                  className="mt-2 w-full rounded-xl bg-gradient-to-r from-blue-700 to-blue-500 py-3 text-sm font-bold text-white shadow-md transition hover:from-blue-600 hover:to-blue-400"
                >
                  Ir para o login
                </button>
              </div>
            )}

            {/* Error */}
            {stage === "error" && (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
                  <XCircle size={36} className="text-red-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Link inválido
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {errorMsg}
                </p>
                <button
                  onClick={() => router.replace("/aluno/entrar")}
                  className="mt-2 w-full rounded-xl bg-gradient-to-r from-blue-700 to-blue-500 py-3 text-sm font-bold text-white shadow-md transition hover:from-blue-600 hover:to-blue-400"
                >
                  Voltar para o login
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[linear-gradient(180deg,#020817_0%,#071235_100%)] flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      </div>
    }>
      <RedefinirSenhaContent />
    </Suspense>
  );
}
