"use client";

// Primeiro acesso de quem comprou: o webhook cria a conta sem senha e manda
// o link por e-mail. Esta tela é o caminho para quem não recebeu — mesma
// mecânica, sem o constrangimento de pedir "esqueci minha senha" a quem
// nunca teve uma.

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { VinkeSymbol } from "@/components/VinkeLogo";

const inputClass =
  "h-12 w-full rounded-[9px] border-[1.5px] border-vinke-line bg-white px-4 text-sm font-medium text-vinke-ink outline-none transition placeholder:text-vinke-ink3 focus:border-vinke focus:ring-[3px] focus:ring-vinke-ring dark:border-vinke-navy-line dark:bg-vinke-navy dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-vinke-lav dark:focus:ring-vinke/30";

export default function CriarSenhaClient() {
  const searchParams = useSearchParams();
  // A Eduzz pode devolver o e-mail da compra na URL — poupa digitação.
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState("");

  const onEnviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    const eMail = email.trim().toLowerCase();
    if (!eMail || !eMail.includes("@")) {
      setErro("Digite o e-mail que você usou na compra.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/esqueci-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: eMail, primeiroAcesso: true }),
      });
      if (!res.ok) throw new Error();
      setEnviado(true);
    } catch {
      setErro("Não foi possível enviar agora. Tente de novo em instantes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-vinke-offwhite p-4 sm:p-6 dark:bg-vinke-navy">
      <div className="mx-auto flex min-h-screen w-full max-w-[560px] items-center justify-center">
        <div className="w-full rounded-3xl border border-vinke-line/80 bg-white p-7 shadow-[0_25px_80px_rgba(11,10,33,0.10)] sm:p-9 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <div className="mb-6 flex items-center gap-3">
            <VinkeSymbol size={30} />
            <div>
              <div className="font-display text-lg font-bold tracking-[0.01em] text-vinke-ink dark:text-white">
                VINKE
              </div>
              <div className="text-xs font-semibold text-vinke-ink3">Primeiro acesso</div>
            </div>
          </div>

          {enviado ? (
            <>
              <h1 className="font-display text-2xl font-bold text-vinke-ink dark:text-white">
                Link enviado ✓
              </h1>
              <p className="mt-3 text-sm leading-6 text-vinke-ink2 dark:text-slate-300">
                Enviamos para <strong>{email.trim().toLowerCase()}</strong> um e-mail com o botão
                para criar sua senha. Ele chega em instantes e vale por 1 hora.
              </p>
              <p className="mt-3 text-sm leading-6 text-vinke-ink3">
                Não encontrou? Veja a caixa de spam e a aba “Promoções”. Se mesmo assim não chegar,
                fale com a gente em{" "}
                <a href="mailto:suporte@vinke.app.br" className="font-semibold text-vinke underline">
                  suporte@vinke.app.br
                </a>
                .
              </p>
              <button
                type="button"
                onClick={() => setEnviado(false)}
                className="mt-6 text-sm font-semibold text-vinke transition hover:text-vinke-deep dark:text-vinke-lav"
              >
                Enviar para outro e-mail
              </button>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold text-vinke-ink dark:text-white">
                Crie sua senha de acesso
              </h1>
              <p className="mt-3 text-sm leading-6 text-vinke-ink2 dark:text-slate-300">
                Informe o e-mail que você usou na compra. Vamos enviar um link para você definir sua
                senha e entrar na plataforma.
              </p>

              <form onSubmit={onEnviar} className="mt-6 space-y-4">
                {erro ? (
                  <div className="rounded-2xl bg-vinke-red-soft px-4 py-3 text-sm text-vinke-red dark:bg-vinke-red/10 dark:text-vinke-red-dark">
                    {erro}
                  </div>
                ) : null}

                <div>
                  <div className="mb-1 text-xs font-bold text-vinke-ink dark:text-slate-200">
                    E-mail da compra
                  </div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    autoComplete="email"
                    placeholder="seuemail@dominio.com"
                    className={inputClass}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-[9px] bg-vinke px-4 py-3 text-sm font-bold text-white shadow-[0_18px_40px_rgba(98,54,240,0.28)] transition hover:bg-vinke-deep disabled:opacity-60"
                >
                  {loading ? "Enviando..." : "Receber link para criar senha"}
                </button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-sm font-medium text-vinke-ink3">
            Já tem senha?{" "}
            <Link
              href="/aluno/entrar"
              className="font-semibold text-vinke transition hover:text-vinke-deep hover:underline dark:text-vinke-lav"
            >
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
