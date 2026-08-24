"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  BarChart3,
  ChevronDown,
  Flame,
  Layers,
  Lock,
  Search,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { fetchOrCreateSettings, fetchPublishedDecks, type DeckListItem } from "@/lib/flashcards/queries";
import { useHasFlashcardsAccess } from "@/lib/flashcards/access";
import { SESSION_SIZES } from "@/lib/flashcards/session";
import { MODULE_LABEL } from "@/lib/flashcards/constants";
import type { UserFlashcardSettingsDoc, Module } from "@/lib/flashcards/types";

/** Remove acentos e baixa a caixa para comparar/buscar sem sensibilidade. */
function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const INITIAL_VISIBLE = 12;
const SESSION_SIZE_KEY = "flashcards:sessionSize";
const DEFAULT_SESSION_SIZE = 20;

export default function FlashcardsClient() {
  const access = useHasFlashcardsAccess();
  const [decks, setDecks] = useState<DeckListItem[]>([]);
  const [settings, setSettings] = useState<UserFlashcardSettingsDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [weakThemes, setWeakThemes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  // Tamanho da sessao: null = fila completa. Fica salvo no navegador.
  const [sessionSize, setSessionSize] = useState<number | null>(DEFAULT_SESSION_SIZE);

  useEffect(() => {
    const saved = window.localStorage.getItem(SESSION_SIZE_KEY);
    if (saved === "all") setSessionSize(null);
    else if (saved && Number(saved) > 0) setSessionSize(Number(saved));
  }, []);

  function chooseSessionSize(n: number | null) {
    setSessionSize(n);
    window.localStorage.setItem(SESSION_SIZE_KEY, n === null ? "all" : String(n));
  }

  /** Acrescenta ?n= ao link de estudo, conforme a escolha do aluno. */
  const studyHref = (deckId?: string) => {
    const params = new URLSearchParams();
    if (deckId) params.set("deck", deckId);
    if (sessionSize) params.set("n", String(sessionSize));
    const qs = params.toString();
    return `/aluno/flashcards/estudar${qs ? `?${qs}` : ""}`;
  };

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
  }, []);

  useEffect(() => {
    if (!access.hasAccess || !uid) {
      if (!access.loading) setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [decksData, settingsData] = await Promise.all([
          fetchPublishedDecks(),
          fetchOrCreateSettings(uid),
        ]);
        if (!alive) return;
        setDecks(decksData);
        setSettings(settingsData);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [access.hasAccess, uid, access.loading]);

  // Temas mais fracos do aluno (para sugerir decks) — não bloqueia a tela
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", uid, "meta", "stats"));
        if (!alive || !snap.exists()) return;
        const byTheme = (snap.data().byTheme ?? {}) as Record<
          string,
          { answered?: number; correct?: number }
        >;
        const ranked = Object.entries(byTheme)
          .filter(([, v]) => (v.answered ?? 0) >= 5)
          .map(([theme, v]) => ({
            theme,
            rate: (v.correct ?? 0) / (v.answered ?? 1),
          }))
          .sort((a, b) => a.rate - b.rate)
          .slice(0, 3)
          .map((t) => t.theme);
        setWeakThemes(ranked);
      } catch {
        // sugestão é opcional; falha silenciosa
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid]);

  // ─── Busca + sugestões ──────────────────────────────────────────────────
  const suggestedDecks = useMemo(() => {
    if (weakThemes.length === 0 || decks.length === 0) return [];
    const normThemes = weakThemes.map(normalize);
    return decks
      .filter((d) => {
        const t = normalize(d.title);
        const th = d.themeId ? normalize(d.themeId) : "";
        return normThemes.some(
          (w) => t.includes(w) || w.includes(t) || (th && (th.includes(w) || w.includes(th)))
        );
      })
      .slice(0, 6);
  }, [decks, weakThemes]);

  const filteredDecks = useMemo(() => {
    const q = normalize(search);
    if (!q) return decks;
    return decks.filter((d) => normalize(d.title).includes(q));
  }, [decks, search]);

  const isSearching = search.trim().length > 0;
  const visibleDecks =
    isSearching || showAll ? filteredDecks : filteredDecks.slice(0, INITIAL_VISIBLE);
  const hiddenCount = filteredDecks.length - visibleDecks.length;

  // ─── Estados de bloqueio ────────────────────────────────────────────────
  if (access.loading) {
    return <LoadingScreen />;
  }
  if (!access.hasAccess) {
    if (access.reason === "wrong_plan") return <UpgradePlanScreen />;
    if (access.reason === "flag_off") return <ComingSoonScreen />;
    return <UpgradePlanScreen />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Flashcards
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Revisão inteligente com repetição espaçada. Estude cards do dia ou escolha um deck específico.
        </p>
      </div>

      {/* Painel de estatisticas */}
      {settings && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            icon={Flame}
            label="Streak"
            value={settings.streak}
            suffix="dia(s)"
            tone="orange"
          />
          <StatCard
            icon={Sparkles}
            label="Cards dominados"
            value={settings.totalCardsMastered}
            tone="emerald"
          />
          <StatCard
            icon={BarChart3}
            label="Total de revisões"
            value={settings.totalReviews}
            tone="blue"
          />
        </div>
      )}

      {/* Card destacado: Estudar hoje */}
      <div className="overflow-hidden rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-8 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-200">
              <Zap size={14} /> Deck do Dia
            </div>
            <h2 className="text-2xl font-black leading-tight">
              Estudar cards de hoje
            </h2>
            <p className="mt-2 text-sm text-blue-100/90">
              Sistema seleciona automaticamente cards vencidos + novos.
              15-20 minutos por dia é o suficiente para dominar o conteúdo.
            </p>
          </div>
          <div className="hidden shrink-0 rounded-2xl bg-white/15 p-4 backdrop-blur sm:block">
            <Sparkles size={32} className="text-yellow-300" />
          </div>
        </div>

        {/* Tamanho da sessão */}
        <div className="mt-6">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-200">
            Quantos cards agora?
          </div>
          <div className="flex flex-wrap gap-2">
            {SESSION_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => chooseSessionSize(n)}
                className={`rounded-xl px-4 py-1.5 text-sm font-bold transition ${
                  sessionSize === n
                    ? "bg-white text-blue-700"
                    : "bg-white/15 text-white hover:bg-white/25"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => chooseSessionSize(null)}
              className={`rounded-xl px-4 py-1.5 text-sm font-bold transition ${
                sessionSize === null
                  ? "bg-white text-blue-700"
                  : "bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              Todos
            </button>
          </div>
        </div>

        <Link
          href={studyHref()}
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50"
        >
          Começar agora →
        </Link>
      </div>

      {/* Sugeridos para você */}
      {!loading && suggestedDecks.length > 0 && !isSearching && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Target size={18} className="text-rose-500" />
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              Sugeridos para você
            </h3>
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
              foco nos seus pontos fracos
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggestedDecks.map((deck) => (
              <DeckCard key={deck.id} deck={deck} href={studyHref(deck.id)} highlighted />
            ))}
          </div>
        </div>
      )}

      {/* Decks */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="shrink-0 text-lg font-black text-slate-900 dark:text-white">
            Todos os decks
          </h3>
          <span className="text-xs text-slate-500">
            {loading
              ? "..."
              : isSearching
              ? `${filteredDecks.length} de ${decks.length} decks`
              : `${decks.length} decks`}
          </span>
        </div>

        {/* Busca */}
        {!loading && decks.length > 0 && (
          <div className="relative mb-4">
            <Search
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar deck por tema... ex: pediatria, obstetrícia, dor"
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-blue-600 dark:focus:ring-blue-950"
            />
          </div>
        )}

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : decks.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <Layers size={40} className="mx-auto mb-3 text-slate-300" />
            <div className="font-semibold text-slate-700 dark:text-slate-300">
              Nenhum deck publicado ainda
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Novos decks aparecerão aqui em breve.
            </div>
          </div>
        ) : filteredDecks.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <Search size={40} className="mx-auto mb-3 text-slate-300" />
            <div className="font-semibold text-slate-700 dark:text-slate-300">
              Nenhum deck encontrado
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Tente buscar por outro termo, ex: &quot;pediatria&quot; ou &quot;dor&quot;.
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleDecks.map((deck) => (
                <DeckCard key={deck.id} deck={deck} href={studyHref(deck.id)} />
              ))}
            </div>
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-600 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-700 dark:hover:text-blue-400"
              >
                <ChevronDown size={16} />
                Mostrar todos os {filteredDecks.length} decks
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DeckCard({
  deck,
  href,
  highlighted,
}: {
  deck: DeckListItem;
  href: string;
  highlighted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group rounded-2xl border p-4 shadow-sm transition hover:shadow-md ${
        highlighted
          ? "border-rose-200 bg-rose-50/50 hover:border-rose-300 dark:border-rose-900/50 dark:bg-rose-950/20 dark:hover:border-rose-700"
          : "border-slate-200 bg-white hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        {deck.moduleId && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {MODULE_LABEL[deck.moduleId as Module]}
          </span>
        )}
        <span className="text-xs text-slate-500">
          {deck.cardCount} card(s)
        </span>
      </div>
      <div
        className={`font-semibold ${
          highlighted
            ? "text-slate-800 group-hover:text-rose-600 dark:text-slate-200 dark:group-hover:text-rose-400"
            : "text-slate-800 group-hover:text-blue-600 dark:text-slate-200 dark:group-hover:text-blue-400"
        }`}
      >
        {deck.title}
      </div>
    </Link>
  );
}

// ─── Componentes auxiliares ────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  tone,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number;
  suffix?: string;
  tone: "orange" | "emerald" | "blue";
}) {
  const colors: Record<string, { bg: string; icon: string }> = {
    orange: {
      bg: "border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/30",
      icon: "text-orange-500",
    },
    emerald: {
      bg: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30",
      icon: "text-emerald-500",
    },
    blue: {
      bg: "border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30",
      icon: "text-blue-500",
    },
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[tone].bg}`}>
      <div className="flex items-center gap-2">
        <Icon size={18} className={colors[tone].icon} />
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300">
          {label}
        </div>
      </div>
      <div className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
        {value.toLocaleString("pt-BR")}
        {suffix && <span className="ml-1 text-sm font-normal text-slate-500">{suffix}</span>}
      </div>
    </div>
  );
}

function UpgradePlanScreen() {
  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-100 p-10 text-center dark:border-blue-900 dark:from-blue-950/40 dark:to-indigo-950/40">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-md">
        <Lock size={32} className="text-blue-600" />
      </div>
      <h2 className="text-2xl font-black text-slate-900 dark:text-white">
        Recurso exclusivo do plano TSA
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-slate-600 dark:text-slate-300">
        Os flashcards com repetição espaçada estão disponíveis apenas para
        alunos do plano <strong>Cobertura Completa (TSA)</strong>. Faça upgrade
        para desbloquear mais de <strong>2.000 cards</strong> de revisão rápida.
      </p>
      <Link
        href="/aluno/assinatura"
        className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-700 to-blue-500 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:from-blue-600 hover:to-blue-400"
      >
        Ver planos disponíveis
      </Link>
    </div>
  );
}

function ComingSoonScreen() {
  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/30">
        <Sparkles size={32} className="text-amber-500" />
      </div>
      <h2 className="text-2xl font-black text-slate-900 dark:text-white">
        Em breve
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-slate-500 dark:text-slate-400">
        Estamos preparando o novo módulo de flashcards. Volte em alguns dias!
      </p>
    </div>
  );
}
