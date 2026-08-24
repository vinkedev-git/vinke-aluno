"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

function mapErroToMessage(code: string) {
  switch (code) {
    case "sessao_ativa":
      return "Sua conta foi acessada em outro dispositivo e esta sessão foi encerrada por segurança.";
    case "sem_acesso":
      return "Seu acesso ainda não está ativo. Se você já pagou, aguarde alguns minutos ou fale com o suporte.";
    case "verificacao":
      return "Não foi possível verificar seu acesso. Tente novamente em instantes.";
    default:
      return "";
  }
}

function friendlyAuthError(code?: string) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "E-mail ou senha inválidos.";
    case "auth/too-many-requests":
      return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    case "auth/network-request-failed":
      return "Falha de rede. Verifique sua conexão e tente novamente.";
    default:
      return "Não foi possível fazer login. Tente novamente.";
  }
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const erro = searchParams.get("erro") || "";
  const erroMsg = useMemo(() => mapErroToMessage(erro), [erro]);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  const [uiError, setUiError] = useState<string>("");
  const [uiInfo, setUiInfo] = useState<string>("");

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setUiError("");
    setUiInfo("");

    const eMail = email.trim().toLowerCase();
    const pwd = senha.trim();
    if (!eMail || !pwd) {
      setUiError("Preencha e-mail e senha.");
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, eMail, pwd);
      router.replace("/aluno");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      setUiError(friendlyAuthError(code));
    } finally {
      setLoading(false);
    }
  };

  const onForgotPassword = async () => {
    setUiError("");
    setUiInfo("");

    const eMail = email.trim().toLowerCase();
    if (!eMail) {
      setUiError("Digite seu e-mail acima para enviar o link de redefinição.");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, eMail);
      setUiInfo("Te enviei um e-mail com o link para redefinir sua senha.");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      setUiError(friendlyAuthError(code));
    } finally {
      setLoading(false);
    }
  };

  const onLogout = async () => {
    setUiError("");
    setUiInfo("");
    setLoading(true);
    try {
      await signOut(auth);
      router.replace("/aluno/entrar");
    } finally {
      setLoading(false);
    }
  };

  const showNoAccessActions = erro === "sem_acesso";

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_20%_0%,rgba(56,189,248,0.16),transparent_45%),radial-gradient(1000px_circle_at_100%_20%,rgba(37,99,235,0.20),transparent_42%),linear-gradient(180deg,#020817_0%,#071235_100%)] p-4 sm:p-6">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-blue-200/15 bg-white/95 shadow-[0_25px_80px_rgba(2,6,23,0.45)] backdrop-blur md:grid-cols-[1.1fr_1fr] dark:border-blue-300/20 dark:bg-[#020b23]/90">
          <div className="relative hidden flex-col justify-between overflow-hidden border-r border-blue-200/20 p-8 md:flex dark:border-blue-300/15">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_20%_0%,rgba(56,189,248,0.23),transparent_55%),radial-gradient(700px_circle_at_100%_80%,rgba(37,99,235,0.26),transparent_50%)]" />

            {/* Brand topo */}
            <div className="relative z-10 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#071a3f] shadow-lg">
                <Image src="/logo-icon.png" alt="Logo" width={28} height={28} className="h-7 w-7 object-contain" />
              </div>
              <div className="text-sm font-black text-slate-900 dark:text-slate-100">Anestesia Questões</div>
            </div>

            {/* Hero central */}
            <div className="relative z-10 flex flex-col items-center py-6 text-center">
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-[#071a3f] shadow-[0_20px_60px_rgba(37,99,235,0.4)]">
                <Image src="/logo.png" alt="Anestesia Questões" width={80} height={80} className="h-16 w-16 object-contain" />
              </div>
              <h1 className="text-2xl font-black leading-tight text-slate-900 dark:text-slate-100">
                Estude com foco.<br />Evolua com dados.
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Simulados personalizados, diagnóstico por tema<br />e acompanhamento de desempenho em tempo real.
              </p>
            </div>

            {/* Features */}
            <div className="relative z-10 space-y-2">
              {[
                { icon: "🧠", text: "+1.600 questões comentadas" },
                { icon: "📊", text: "Dashboard de desempenho por tema" },
                { icon: "🎯", text: "Simulados ME1, ME2, ME3 e TEA" },
              ].map((f) => (
                <div key={f.text} className="flex items-center gap-3 rounded-2xl border border-blue-200/20 bg-white/60 px-4 py-3 dark:border-blue-300/10 dark:bg-[#081937]/60">
                  <span className="text-base">{f.icon}</span>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{f.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-5 sm:p-7 md:p-8">
            <div className="mb-5 flex items-center gap-3 md:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-200/30 bg-[#071a3f]">
                <Image src="/logo.png" alt="Logo Anestesia Questões" width={38} height={38} className="h-9 w-9 object-contain" />
              </div>
              <div>
                <div className="text-lg font-black text-slate-900 dark:text-slate-100">Anestesia Questões</div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Área do Aluno</div>
              </div>
            </div>

            <div className="mb-6">
              <div className="text-[11px] font-bold tracking-[0.18em] text-slate-500 dark:text-slate-400">ACESSO DO ALUNO</div>
              <div className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">Entrar na plataforma</div>
            </div>

            <form onSubmit={onLogin} className="space-y-4">
              {erroMsg ? (
                <div className="rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
                  {erroMsg}
                </div>
              ) : null}

              {uiError ? (
                <div className="rounded-2xl border border-rose-300/60 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">
                  {uiError}
                </div>
              ) : null}

              {uiInfo ? (
                <div className="rounded-2xl border border-emerald-300/60 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                  {uiInfo}
                </div>
              ) : null}

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">E-mail</div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="seuemail@dominio.com"
                  className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-200/40 dark:border-slate-600 dark:bg-[#0a1737] dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-blue-400 dark:focus:ring-blue-500/30"
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">Senha</div>
                <input
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-200/40 dark:border-slate-600 dark:bg-[#0a1737] dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-blue-400 dark:focus:ring-blue-500/30"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-[0_18px_40px_rgba(37,99,235,0.35)] transition hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>

              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={onForgotPassword}
                  disabled={loading}
                  className="text-sm font-semibold text-slate-700 transition hover:text-slate-900 hover:underline disabled:opacity-60 dark:text-slate-200 dark:hover:text-white"
                >
                  Esqueci minha senha
                </button>

                {showNoAccessActions ? (
                  <button
                    type="button"
                    onClick={onLogout}
                    disabled={loading}
                    className="text-sm font-semibold text-slate-700 transition hover:text-slate-900 hover:underline disabled:opacity-60 dark:text-slate-200 dark:hover:text-white"
                  >
                    Sair / Trocar conta
                  </button>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-700/80 dark:bg-[#0a1737]/65 dark:text-slate-300">
                Dica: se você recebeu o e-mail “Crie sua senha”, você também pode usar “Esqueci minha senha”.
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
