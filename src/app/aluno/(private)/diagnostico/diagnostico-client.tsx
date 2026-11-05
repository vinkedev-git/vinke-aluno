"use client";
// Primeiro passo de todo aluno novo (o cadastro manda para cá). Explica o
// diagnóstico, cria a sessão e abre o player do simulado. Quem já começou
// continua de onde parou; quem terminou vai para o resultado.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { AREAS_DIAGNOSTICO, DIAGNOSTICO_TOTAL, criarDiagnostico, lerDiagnostico, type EstadoDiagnostico } from "@/lib/diagnostico";
import { track } from "@/components/MetaPixel";

export default function DiagnosticoClient() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoDiagnostico | undefined>(undefined);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      setUid(u.uid);
      try {
        setEstado(await lerDiagnostico(u.uid));
      } catch {
        setEstado(null);
      }
    });
  }, []);

  const comecar = async () => {
    if (!uid) return;
    setErro("");
    setCriando(true);
    try {
      const id = await criarDiagnostico(uid);
      track("StartTrial", { content_name: "diagnostico" });
      router.push(`/aluno/simulados/${id}`);
    } catch {
      setErro("Não deu para montar o diagnóstico agora. Tente de novo em instantes.");
      setCriando(false);
    }
  };

  if (estado === undefined) {
    return <div className="grid min-h-[50vh] place-items-center text-sm text-vinke-ink3">Carregando…</div>;
  }

  const emAndamento = estado?.sessionId && !estado.concluido;

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-6 py-4">
      <div>
        <div className="text-[11px] font-bold tracking-[0.18em] text-vinke dark:text-vinke-lav">PRIMEIRO PASSO</div>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight text-vinke-ink dark:text-white">
          {estado?.concluido ? "Seu diagnóstico está pronto" : "Vamos descobrir onde você está"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-vinke-ink3 dark:text-slate-300">
          {estado?.concluido
            ? "Veja seu acerto por área e o que treinar primeiro."
            : `${DIAGNOSTICO_TOTAL} questões oficiais do ENEM, das quatro áreas. Leva uns 15 minutos. No final, você vê seu acerto por área e o Vinke monta o que treinar primeiro.`}
        </p>
      </div>

      {!estado?.concluido && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {AREAS_DIAGNOSTICO.map((a) => (
            <div key={a.id} className="rounded-2xl border border-vinke-line bg-white px-3 py-3 text-center dark:border-vinke-navy-line dark:bg-vinke-navy-card">
              <div className="font-display text-xl font-bold text-vinke dark:text-vinke-lav">{a.n}</div>
              <div className="text-[11px] font-semibold text-vinke-ink3">{a.nome}</div>
            </div>
          ))}
        </div>
      )}

      {erro && <div className="rounded-2xl bg-vinke-red-soft px-4 py-3 text-sm text-vinke-red">{erro}</div>}

      {estado?.concluido && estado.sessionId ? (
        <Link
          href={`/aluno/simulados/${estado.sessionId}/resultado`}
          className="rounded-[10px] bg-vinke px-6 py-3.5 text-center text-sm font-bold text-white shadow-[0_18px_40px_rgba(98,54,240,0.28)]"
        >
          Ver meu resultado
        </Link>
      ) : emAndamento ? (
        <Link
          href={`/aluno/simulados/${estado!.sessionId}`}
          className="rounded-[10px] bg-vinke px-6 py-3.5 text-center text-sm font-bold text-white shadow-[0_18px_40px_rgba(98,54,240,0.28)]"
        >
          Continuar o diagnóstico
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => void comecar()}
          disabled={criando || !uid}
          className="rounded-[10px] bg-vinke px-6 py-3.5 text-sm font-bold text-white shadow-[0_18px_40px_rgba(98,54,240,0.28)] transition hover:bg-vinke-deep disabled:opacity-60"
        >
          {criando ? "Montando suas questões…" : "Começar o diagnóstico"}
        </button>
      )}

      {!estado?.concluido && (
        <Link href="/aluno" className="text-center text-xs font-semibold text-vinke-ink3 hover:underline">
          Agora não, ir para o início
        </Link>
      )}
    </div>
  );
}
