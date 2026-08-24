"use client";

import { useCallback, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Settings2, CheckCircle2, Target, Zap, Clock } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type Settings = {
  dailyQuestionsGoal: number;
  dailyFlashcardsGoal: number;
  dailyMinutesGoal: number;
  studyDays: string[];
  targetExam: string;
  targetExamDate: string;
};

const DEFAULTS: Settings = {
  dailyQuestionsGoal: 20,
  dailyFlashcardsGoal: 10,
  dailyMinutesGoal: 30,
  studyDays: ["segunda", "terça", "quarta", "quinta", "sexta"],
  targetExam: "",
  targetExamDate: "",
};

const DAYS = [
  { key: "segunda", label: "Seg" },
  { key: "terça", label: "Ter" },
  { key: "quarta", label: "Qua" },
  { key: "quinta", label: "Qui" },
  { key: "sexta", label: "Sex" },
  { key: "sábado", label: "Sáb" },
  { key: "domingo", label: "Dom" },
];

const EXAM_OPTIONS = ["ME1", "ME2", "ME3", "TEA", "TSA", "Outro"];

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConfiguracoesClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<Settings>(DEFAULTS);

  const load = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "users", u.uid, "meta", "settings"));
      if (snap.exists()) {
        const data = snap.data() as Partial<Settings>;
        setForm({
          dailyQuestionsGoal: Number(data.dailyQuestionsGoal ?? DEFAULTS.dailyQuestionsGoal),
          dailyFlashcardsGoal: Number(data.dailyFlashcardsGoal ?? DEFAULTS.dailyFlashcardsGoal),
          dailyMinutesGoal: Number(data.dailyMinutesGoal ?? DEFAULTS.dailyMinutesGoal),
          studyDays: Array.isArray(data.studyDays) ? data.studyDays : DEFAULTS.studyDays,
          targetExam: String(data.targetExam ?? ""),
          targetExamDate: String(data.targetExamDate ?? ""),
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function onSave() {
    const u = auth.currentUser;
    if (!u || saving) return;
    setSaving(true);
    setSaved(false);
    try {
      await setDoc(
        doc(db, "users", u.uid, "meta", "settings"),
        { ...form, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  function setNum(key: keyof Settings, val: number, min: number, max: number) {
    setForm((prev) => ({ ...prev, [key]: Math.min(max, Math.max(min, val || min)) }));
  }

  function toggleDay(day: string) {
    setForm((prev) => ({
      ...prev,
      studyDays: prev.studyDays.includes(day)
        ? prev.studyDays.filter((d) => d !== day)
        : [...prev.studyDays, day],
    }));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* Header */}
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">Configurações</div>
        <div className="mt-0.5 text-3xl font-black text-slate-900 dark:text-slate-100">Metas diárias</div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Defina quantas questões e flashcards quer resolver por dia para acompanhar seu progresso.
        </div>
      </div>

      {/* Metas numéricas */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-slate-900/50">
        <div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100">
          <Target size={16} className="text-indigo-500" /> Metas por dia
        </div>
        <div className="space-y-4">
          {/* Questões */}
          <GoalRow
            label="Questões"
            icon={<Zap size={14} className="text-indigo-500" />}
            hint="Questões respondidas nos simulados"
            value={form.dailyQuestionsGoal}
            min={1} max={100}
            onChange={(v) => setNum("dailyQuestionsGoal", v, 1, 100)}
          />
          {/* Flashcards */}
          <GoalRow
            label="Flashcards"
            icon={<Zap size={14} className="text-blue-500" />}
            hint="Cards revisados na sessão de flashcards"
            value={form.dailyFlashcardsGoal}
            min={1} max={50}
            onChange={(v) => setNum("dailyFlashcardsGoal", v, 1, 50)}
          />
          {/* Minutos */}
          <GoalRow
            label="Minutos de estudo"
            icon={<Clock size={14} className="text-emerald-500" />}
            hint="Tempo estimado (calculado automaticamente)"
            value={form.dailyMinutesGoal}
            min={5} max={180}
            onChange={(v) => setNum("dailyMinutesGoal", v, 5, 180)}
          />
        </div>
      </div>

      {/* Dias de estudo */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-slate-900/50">
        <div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100">
          <Settings2 size={16} className="text-indigo-500" /> Dias de estudo
        </div>
        <div className="flex flex-wrap gap-2">
          {DAYS.map(({ key, label }) => {
            const active = form.studyDays.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(key)}
                className={cn(
                  "h-10 w-12 rounded-2xl border text-sm font-bold transition",
                  active
                    ? "border-slate-900 bg-slate-900 text-white dark:border-blue-500 dark:bg-blue-500"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          {form.studyDays.length === 0
            ? "Nenhum dia selecionado."
            : `${form.studyDays.length} dia${form.studyDays.length > 1 ? "s" : ""} por semana.`}
        </div>
      </div>

      {/* Prova alvo */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-slate-900/50">
        <div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100">
          <Target size={16} className="text-amber-500" /> Prova alvo <span className="text-xs font-normal text-slate-400">(opcional)</span>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Prova</label>
            <div className="flex flex-wrap gap-2">
              {EXAM_OPTIONS.map((exam) => {
                const active = form.targetExam === exam;
                return (
                  <button
                    key={exam}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, targetExam: active ? "" : exam }))}
                    className={cn(
                      "rounded-2xl border px-4 py-1.5 text-sm font-semibold transition",
                      active
                        ? "border-amber-500 bg-amber-500 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    )}
                  >
                    {exam}
                  </button>
                );
              })}
            </div>
          </div>
          {form.targetExam && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Data da prova</label>
              <input
                type="date"
                value={form.targetExamDate}
                onChange={(e) => setForm((p) => ({ ...p, targetExamDate: e.target.value }))}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          )}
        </div>
      </div>

      {/* Salvar */}
      <div className="flex items-center justify-between gap-4">
        <Button onClick={onSave} disabled={saving} className="gap-2">
          {saved ? <CheckCircle2 size={14} /> : <Settings2 size={14} />}
          {saving ? "Salvando…" : saved ? "Salvo!" : "Salvar configurações"}
        </Button>
        {saved && (
          <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            ✓ Configurações salvas
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Sub-componente de linha de meta ─────────────────────────────────────────

function GoalRow({
  label, icon, hint, value, min, max, onChange,
}: {
  label: string;
  icon: React.ReactNode;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {icon} {label}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{hint}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          −
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 w-14 rounded-xl border border-slate-200 bg-slate-50 text-center text-sm font-bold text-slate-900 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          +
        </button>
      </div>
    </div>
  );
}
