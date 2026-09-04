"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { VinkeSymbol } from "@/components/VinkeLogo";

const inputClass =
  "h-12 w-full rounded-[9px] border-[1.5px] border-vinke-line bg-white px-4 text-sm font-medium text-vinke-ink outline-none transition placeholder:text-vinke-ink3 focus:border-vinke focus:ring-[3px] focus:ring-vinke-ring dark:border-vinke-navy-line dark:bg-vinke-navy dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-vinke-lav dark:focus:ring-vinke/30";

export default function CadastroClient() {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [uiError, setUiError] = useState("");

  const onCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    setUiError("");

    const nomeOk = nome.trim();
    const eMail = email.trim().toLowerCase();
    if (nomeOk.length < 2) {
      setUiError("Digite seu nome.");
      return;
    }
    if (!eMail || !eMail.includes("@")) {
      setUiError("Digite um e-mail válido.");
      return;
    }
    if (senha.length < 6) {
      setUiError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeOk, email: eMail, senha }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setUiError(data.error || "Não foi possível criar sua conta. Tente novamente.");
        return;
      }

      // Conta criada — entra direto.
      await signInWithEmailAndPassword(auth, eMail, senha);
      router.replace("/aluno");
    } catch {
      setUiError("Não foi possível criar sua conta. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

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
                Comece grátis.
                <br />
                Hoje mesmo.
              </h1>
              <p className="mt-3 text-sm leading-6 text-vinke-ink3">
                Sem cartão de crédito. Crie sua conta
                <br />e faça sua primeira questão em 1 minuto.
              </p>
            </div>

            {/* O que vem no grátis */}
            <div className="relative z-10 space-y-2">
              {[
                { icon: "✓", text: "10 questões oficiais comentadas por dia" },
                { icon: "🗓️", text: "1 simulado completo por mês" },
                { icon: "🔥", text: "Questão do dia e sequência de treino" },
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
                CONTA GRATUITA
              </div>
              <div className="mt-1 font-display text-2xl font-bold text-vinke-ink dark:text-white">
                Criar minha conta
              </div>
            </div>

            <form onSubmit={onCadastro} className="space-y-4">
              {uiError ? (
                <div className="rounded-2xl bg-vinke-red-soft px-4 py-3 text-sm text-vinke-red dark:bg-vinke-red/10 dark:text-vinke-red-dark">
                  {uiError}
                </div>
              ) : null}

              <div>
                <div className="mb-1 text-xs font-bold text-vinke-ink dark:text-slate-200">Nome</div>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  type="text"
                  autoComplete="name"
                  placeholder="Como quer ser chamado(a)?"
                  className={inputClass}
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-bold text-vinke-ink dark:text-slate-200">E-mail</div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="seuemail@dominio.com"
                  className={inputClass}
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-bold text-vinke-ink dark:text-slate-200">Senha</div>
                <input
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mínimo de 6 caracteres"
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-[9px] bg-vinke px-4 py-3 text-sm font-bold text-white shadow-[0_18px_40px_rgba(98,54,240,0.28)] transition hover:bg-vinke-deep disabled:opacity-60"
              >
                {loading ? "Criando conta..." : "Criar conta grátis"}
              </button>

              <p className="text-center text-sm font-medium text-vinke-ink3">
                Já tem conta?{" "}
                <Link
                  href="/aluno/entrar"
                  className="font-semibold text-vinke transition hover:text-vinke-deep hover:underline dark:text-vinke-lav"
                >
                  Entrar
                </Link>
              </p>

              <p className="text-center text-[11px] leading-5 text-vinke-ink4">
                Ao criar a conta, você concorda com os{" "}
                <a
                  href="https://vinke-swart.vercel.app/termos"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-vinke-ink2"
                >
                  Termos de Uso
                </a>{" "}
                e a{" "}
                <a
                  href="https://vinke-swart.vercel.app/privacidade"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-vinke-ink2"
                >
                  Política de Privacidade
                </a>
                .
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
