"use client";

import { useCallback, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Settings2, CheckCircle2, Target, Zap } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type Settings = {
  dailyQuestionsGoal: number;
  dailyFlashcardsGoal: number;
  dailyMinutesGoal: number;
  studyDays: string[];
  targetExam: string;
  targetExamDate: string;
  metaNota: number;
};

const DEFAULTS: Settings = {
  dailyQuestionsGoal: 20,
  dailyFlashcardsGoal: 10,
  dailyMinutesGoal: 30,
  studyDays: ["segunda", "terça", "quarta", "quinta", "sexta"],
  targetExam: "",
  targetExamDate: "",
  metaNota: 0,
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

// Alvo do aluno: o ENEM do ano corrente, o do ano seguinte, ou outro vestibular.
const ANO_ATUAL = new Date().getFullYear();
const EXAM_OPTIONS = [`ENEM ${ANO_ATUAL}`, `ENEM ${ANO_ATUAL + 1}`, "Outro vestibular"];

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
          metaNota: Number(data.metaNota ?? 0),
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
        <div className="h-8 w-48 animate-pulse rounded-2xl bg-vinke-line2 dark:bg-vinke-navy-sel" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-vinke-line2 dark:bg-vinke-navy-sel" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* Header */}
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-vinke-ink3 dark:text-vinke-ink3">Configurações</div>
        <div className="mt-0.5 text-3xl font-black text-vinke-ink dark:text-slate-100">Metas diárias</div>
        <div className="mt-1 text-sm text-vinke-ink3 dark:text-vinke-ink4">
          Defina quantas questões e flashcards quer resolver por dia para acompanhar seu progresso.
        </div>
      </div>

      {/* Metas numéricas */}
      <div className="rounded-2xl border border-vinke-line bg-white p-5 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
        <div className="mb-4 flex items-center gap-2 text-sm font-black text-vinke-ink dark:text-slate-100">
          <Target size={16} className="text-vinke" /> Metas por dia
        </div>
        <div className="space-y-4">
          {/* Questões */}
          <GoalRow
            label="Questões"
            icon={<Zap size={14} className="text-vinke" />}
            hint="Questões respondidas nos simulados"
            value={form.dailyQuestionsGoal}
            min={1} max={100}
            onChange={(v) => setNum("dailyQuestionsGoal", v, 1, 100)}
          />
          {/* Flashcards */}
          <GoalRow
            label="Flashcards"
            icon={<Zap size={14} className="text-vinke" />}
            hint="Cards revisados na sessão de flashcards"
            value={form.dailyFlashcardsGoal}
            min={1} max={50}
            onChange={(v) => setNum("dailyFlashcardsGoal", v, 1, 50)}
          />
        </div>
      </div>

      {/* Dias de estudo */}
      <div className="rounded-2xl border border-vinke-line bg-white p-5 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
        <div className="mb-4 flex items-center gap-2 text-sm font-black text-vinke-ink dark:text-slate-100">
          <Settings2 size={16} className="text-vinke" /> Dias de estudo
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
                    ? "border-vinke bg-vinke text-white"
                    : "border-vinke-line bg-white text-vinke-ink2 hover:border-vinke-ink4 hover:bg-vinke-offwhite dark:border-vinke-navy-line dark:bg-vinke-navy-card dark:text-slate-300 dark:hover:bg-vinke-navy-sel"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-xs text-vinke-ink4 dark:text-vinke-ink3">
          {form.studyDays.length === 0
            ? "Nenhum dia selecionado."
            : `${form.studyDays.length} dia${form.studyDays.length > 1 ? "s" : ""} por semana.`}
        </div>
      </div>

      {/* Prova alvo */}
      <div className="rounded-2xl border border-vinke-line bg-white p-5 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
        <div className="mb-4 flex items-center gap-2 text-sm font-black text-vinke-ink dark:text-slate-100">
          <Target size={16} className="text-vinke-amber-bar" /> Prova alvo <span className="text-xs font-normal text-vinke-ink4">(opcional)</span>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-vinke-ink2 dark:text-vinke-ink4">Prova</label>
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
                        ? "border-vinke bg-vinke text-white"
                        : "border-vinke-line bg-white text-vinke-ink2 hover:border-vinke-ink4 dark:border-vinke-navy-line dark:bg-vinke-navy-card dark:text-slate-300"
                    )}
                  >
                    {exam}
                  </button>
                );
              })}
            </div>
          </div>
          {form.targetExam && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-vinke-ink dark:text-slate-200">Meta de nota</span>
                  <span className="text-[10px] font-medium text-vinke-ink3">usada no acompanhamento do Início</span>
                </div>
                <input
                  type="number"
                  min={300}
                  max={1000}
                  step={10}
                  value={form.metaNota || ""}
                  placeholder="720"
                  onChange={(e) => setForm((p) => ({ ...p, metaNota: Number(e.target.value) || 0 }))}
                  className="w-24 rounded-[9px] border-[1.5px] border-vinke-line bg-white px-3 py-2 text-center font-display text-sm font-bold text-vinke-ink outline-none focus:border-vinke focus:ring-[3px] focus:ring-vinke-ring dark:border-vinke-navy-line dark:bg-vinke-navy dark:text-slate-100"
                />
              </div>
              <label className="mb-1 block text-xs font-semibold text-vinke-ink2 dark:text-vinke-ink4">Data da prova</label>
              <input
                type="date"
                value={form.targetExamDate}
                onChange={(e) => setForm((p) => ({ ...p, targetExamDate: e.target.value }))}
                className="h-10 w-full rounded-xl border border-vinke-line bg-vinke-offwhite px-3 text-sm text-vinke-ink outline-none transition focus:border-vinke focus:ring-2 focus:ring-blue-200/40 dark:border-vinke-navy-line dark:bg-vinke-navy-sel dark:text-slate-100"
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
          <span className="text-sm font-semibold text-vinke-green-text dark:text-vinke-green">
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
        <div className="flex items-center gap-1.5 text-sm font-semibold text-vinke-ink dark:text-slate-100">
          {icon} {label}
        </div>
        <div className="text-xs text-vinke-ink3 dark:text-vinke-ink4">{hint}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-vinke-line text-vinke-ink2 transition hover:bg-vinke-offwhite disabled:opacity-40 dark:border-vinke-navy-line dark:text-slate-300 dark:hover:bg-vinke-navy-sel"
        >
          −
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 w-14 rounded-xl border border-vinke-line bg-vinke-offwhite text-center text-sm font-bold text-vinke-ink outline-none focus:border-vinke dark:border-vinke-navy-line dark:bg-vinke-navy-sel dark:text-slate-100"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-vinke-line text-vinke-ink2 transition hover:bg-vinke-offwhite disabled:opacity-40 dark:border-vinke-navy-line dark:text-slate-300 dark:hover:bg-vinke-navy-sel"
        >
          +
        </button>
      </div>
    </div>
  );
}
