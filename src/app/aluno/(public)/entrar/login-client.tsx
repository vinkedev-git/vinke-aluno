"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { VinkeSymbol } from "@/components/VinkeLogo";

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
    const pwd = senha; // não fazer trim — senha pode ter espaços intencionais
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
      const res = await fetch("/api/auth/esqueci-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: eMail }),
      });
      if (!res.ok) throw new Error("Falha ao enviar e-mail.");
      setUiInfo("Te enviei um e-mail com o link para redefinir sua senha.");
    } catch {
      setUiError("Não foi possível enviar o e-mail. Tente novamente em instantes.");
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
    <div className="min-h-screen bg-vinke-offwhite p-4 sm:p-6 dark:bg-vinke-navy">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-vinke-line/80 bg-white shadow-[0_25px_80px_rgba(11,10,33,0.10)] md:grid-cols-[1.1fr_1fr] dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <div className="relative hidden flex-col justify-between overflow-hidden border-r border-vinke-line2 p-8 md:flex dark:border-vinke-navy-line">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_18%_0%,rgba(98,54,240,0.07),transparent_55%),radial-gradient(700px_circle_at_100%_85%,rgba(98,54,240,0.09),transparent_50%)]" />

            {/* Brand topo */}
            <div className="relative z-10 flex items-center gap-2">
              <VinkeSymbol size={22} />
              <span className="font-display text-lg font-bold tracking-[0.01em] text-vinke-ink dark:text-white">
                VINKE
              </span>
            </div>

            {/* Hero central */}
            <div className="relative z-10 flex flex-col items-center py-6 text-center">
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-vinke-navy shadow-[0_20px_60px_rgba(98,54,240,0.30)]">
                <VinkeSymbol size={52} className="text-white" />
              </div>
              <h1 className="font-display text-2xl font-bold leading-tight text-vinke-ink dark:text-white">
                Entre para continuar
                <br />
                evoluindo.
              </h1>
              <p className="mt-3 text-sm leading-6 text-vinke-ink3">
                Questões, simulados e dados que mostram
                <br />
                exatamente onde você precisa evoluir.
              </p>
            </div>

            {/* Features */}
            <div className="relative z-10 space-y-2">
              {[
                { icon: "✓", text: "Questões oficiais do ENEM comentadas" },
                { icon: "📊", text: "Estatísticas por área, disciplina e assunto" },
                { icon: "🎯", text: "Simulados no formato real da prova" },
              ].map((f) => (
                <div
                  key={f.text}
                  className="flex items-center gap-3 rounded-2xl bg-vinke-offwhite px-4 py-3 dark:bg-vinke-navy"
                >
                  <span className="text-base">{f.icon}</span>
                  <span className="text-sm font-semibold text-vinke-ink2 dark:text-slate-200">{f.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-5 sm:p-7 md:p-8">
            <div className="mb-5 flex items-center gap-3 md:hidden">
              <VinkeSymbol size={32} />
              <div>
                <div className="font-display text-lg font-bold tracking-[0.01em] text-vinke-ink dark:text-white">
                  VINKE
                </div>
                <div className="text-xs font-semibold text-vinke-ink3">Área do Aluno</div>
              </div>
            </div>

            <div className="mb-6">
              <div className="text-[11px] font-bold tracking-[0.18em] text-vinke dark:text-vinke-lav">
                ACESSO DO ALUNO
              </div>
              <div className="mt-1 font-display text-2xl font-bold text-vinke-ink dark:text-white">
                Entrar na plataforma
              </div>
            </div>

            <form onSubmit={onLogin} className="space-y-4">
              {erroMsg ? (
                <div className="rounded-2xl bg-vinke-amber-soft px-4 py-3 text-sm text-vinke-amber dark:bg-vinke-amber/10 dark:text-vinke-amber-bar">
                  {erroMsg}
                </div>
              ) : null}

              {uiError ? (
                <div className="rounded-2xl bg-vinke-red-soft px-4 py-3 text-sm text-vinke-red dark:bg-vinke-red/10 dark:text-vinke-red-dark">
                  {uiError}
                </div>
              ) : null}

              {uiInfo ? (
                <div className="rounded-2xl bg-vinke-green-soft px-4 py-3 text-sm text-vinke-green-text dark:bg-vinke-green/10 dark:text-vinke-green">
                  {uiInfo}
                </div>
              ) : null}

              <div>
                <div className="mb-1 text-xs font-bold text-vinke-ink dark:text-slate-200">E-mail</div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="seuemail@dominio.com"
                  className="h-12 w-full rounded-[9px] border-[1.5px] border-vinke-line bg-white px-4 text-sm font-medium text-vinke-ink outline-none transition placeholder:text-vinke-ink3 focus:border-vinke focus:ring-[3px] focus:ring-vinke-ring dark:border-vinke-navy-line dark:bg-vinke-navy dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-vinke-lav dark:focus:ring-vinke/30"
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-bold text-vinke-ink dark:text-slate-200">Senha</div>
                <input
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  className="h-12 w-full rounded-[9px] border-[1.5px] border-vinke-line bg-white px-4 text-sm font-medium text-vinke-ink outline-none transition placeholder:text-vinke-ink3 focus:border-vinke focus:ring-[3px] focus:ring-vinke-ring dark:border-vinke-navy-line dark:bg-vinke-navy dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-vinke-lav dark:focus:ring-vinke/30"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-[9px] bg-vinke px-4 py-3 text-sm font-bold text-white shadow-[0_18px_40px_rgba(98,54,240,0.28)] transition hover:bg-vinke-deep disabled:opacity-60"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>

              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={onForgotPassword}
                  disabled={loading}
                  className="text-sm font-semibold text-vinke transition hover:text-vinke-deep hover:underline disabled:opacity-60 dark:text-vinke-lav"
                >
                  Esqueci minha senha
                </button>

                {showNoAccessActions ? (
                  <button
                    type="button"
                    onClick={onLogout}
                    disabled={loading}
                    className="text-sm font-semibold text-vinke-ink2 transition hover:text-vinke-ink hover:underline disabled:opacity-60 dark:text-slate-200 dark:hover:text-white"
                  >
                    Sair / Trocar conta
                  </button>
                ) : null}
              </div>

              <p className="text-center text-sm font-medium text-vinke-ink3">
                Ainda não tem conta?{" "}
                <a
                  href="/aluno/cadastro"
                  className="font-semibold text-vinke transition hover:text-vinke-deep hover:underline dark:text-vinke-lav"
                >
                  Criar conta grátis
                </a>
              </p>

              <div className="rounded-2xl bg-vinke-offwhite px-3 py-2 text-xs text-vinke-ink2 dark:bg-vinke-navy dark:text-slate-300">
                Dica: se você recebeu o e-mail “Crie sua senha”, você também pode usar “Esqueci minha senha”.
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
