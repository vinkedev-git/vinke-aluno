"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { KeyRound, Mail, User, Phone, MapPin, Save, X, Pencil } from "lucide-react";

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

type ProfileData = {
  name?: string;
  gender?: string;
  phone?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  updatedAt?: unknown;
  createdAt?: unknown;
  source?: "eduzz" | "user";
  eduzzCustomerId?: string;
};

function initials(nameOrEmail: string) {
  const s = (nameOrEmail || "").trim();
  if (!s) return "V";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
}

function Field({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  disabled,
  half,
}: {
  label: string;
  icon?: React.ElementType;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  half?: boolean;
}) {
  return (
    <div className={cn(half ? "sm:col-span-6" : "sm:col-span-12")}>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-vinke-ink3 dark:text-vinke-ink4">
        {Icon && <Icon size={12} />}
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="ui-input"
      />
    </div>
  );
}

function SkeletonPerfil() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-vinke-line bg-white p-6 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PerfilClient() {
  const router = useRouter();
  const toast = useToast();
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const [email, setEmail] = useState(user?.email || "");
  const [data, setData] = useState<ProfileData>({});

  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [addressNeighborhood, setAddressNeighborhood] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressZip, setAddressZip] = useState("");

  const displayName = useMemo(
    () => (name || data.name || email || "Seu perfil").trim(),
    [name, data.name, email]
  );

  const load = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) { router.replace("/aluno/entrar"); return; }
    setLoading(true);
    try {
      setEmail(u.email || "");

      // Lê dos dois lugares:
      // 1. users/{uid}        — formato antigo (flat: addressStreet, etc.)
      // 2. users/{uid}/profile/main — formato do admin (nested: address.street)
      const [userSnap, profileSnap] = await Promise.all([
        getDoc(doc(db, "users", u.uid)),
        getDoc(doc(db, "users", u.uid, "profile", "main")),
      ]);

      const userData = (userSnap.exists() ? (userSnap.data() as ProfileData) : {}) || {};
      const profileData = profileSnap.exists() ? (profileSnap.data() as Record<string, unknown>) : {};
      const nestedAddr = (profileData.address as Record<string, unknown> | undefined) || {};

      // Profile/main do admin tem prioridade quando preenchido; senão usa users/{uid}.
      const pick = (adminVal: unknown, userVal: string | undefined): string => {
        const a = typeof adminVal === "string" ? adminVal.trim() : "";
        return a || (userVal || "");
      };

      const merged: ProfileData = {
        ...userData,
        name: pick(profileData.name, userData.name),
        gender: (typeof profileData.gender === "string" ? profileData.gender : "") || userData.gender || "",
        phone: pick(profileData.phone, userData.phone),
        addressStreet: pick(nestedAddr.street, userData.addressStreet),
        addressNumber: pick(nestedAddr.number, userData.addressNumber),
        addressComplement: pick(nestedAddr.complement, userData.addressComplement),
        addressNeighborhood: pick(nestedAddr.neighborhood, userData.addressNeighborhood),
        addressCity: pick(nestedAddr.city, userData.addressCity),
        addressState: pick(nestedAddr.state, userData.addressState),
        addressZip: pick(nestedAddr.zipCode, userData.addressZip),
      };

      setData(merged);
      setName(merged.name || "");
      setGender(merged.gender || "");
      setPhone(merged.phone || "");
      setAddressStreet(merged.addressStreet || "");
      setAddressNumber(merged.addressNumber || "");
      setAddressComplement(merged.addressComplement || "");
      setAddressNeighborhood(merged.addressNeighborhood || "");
      setAddressCity(merged.addressCity || "");
      setAddressState(merged.addressState || "");
      setAddressZip(merged.addressZip || "");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  function cancelEdit() {
    setName(data.name || ""); setGender(data.gender || ""); setPhone(data.phone || "");
    setAddressStreet(data.addressStreet || ""); setAddressNumber(data.addressNumber || "");
    setAddressComplement(data.addressComplement || ""); setAddressNeighborhood(data.addressNeighborhood || "");
    setAddressCity(data.addressCity || ""); setAddressState(data.addressState || "");
    setAddressZip(data.addressZip || "");
    setEditing(false);
  }

  async function onSave() {
    const u = auth.currentUser;
    if (!u) return;
    setSaving(true);
    try {
      // Formato flat (compatibilidade com perfis antigos do portal)
      const payload: ProfileData = {
        name: name.trim(), gender, phone: phone.trim(),
        addressStreet: addressStreet.trim(), addressNumber: addressNumber.trim(),
        addressComplement: addressComplement.trim(), addressNeighborhood: addressNeighborhood.trim(),
        addressCity: addressCity.trim(), addressState: addressState.trim(),
        addressZip: addressZip.trim(),
        updatedAt: serverTimestamp(),
        createdAt: data.createdAt ? data.createdAt : serverTimestamp(),
        source: "user",
      };

      // Formato nested (compatibilidade com o admin / fonte canônica)
      const profilePayload = {
        name: name.trim() || null,
        gender: gender || null,
        phone: phone.trim() || null,
        address: {
          street: addressStreet.trim() || null,
          number: addressNumber.trim() || null,
          complement: addressComplement.trim() || null,
          neighborhood: addressNeighborhood.trim() || null,
          city: addressCity.trim() || null,
          state: addressState.trim() || null,
          zipCode: addressZip.trim() || null,
        },
        source: "user",
        updatedAt: serverTimestamp(),
      };

      await Promise.all([
        setDoc(doc(db, "users", u.uid), payload, { merge: true }),
        setDoc(doc(db, "users", u.uid, "profile", "main"), profilePayload, { merge: true }),
      ]);

      setData((prev) => ({ ...prev, ...payload }));
      setEditing(false);
      toast.success("Perfil atualizado com sucesso!");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro ao salvar perfil.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    const userEmail = auth.currentUser?.email || "";
    if (!userEmail) { toast.error("Seu usuário não tem e-mail."); return; }
    setSendingReset(true);
    try {
      const res = await fetch("/api/auth/esqueci-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      if (!res.ok) throw new Error();
      toast.success("Link de redefinição enviado para o seu e-mail!");
    } catch {
      toast.error("Não foi possível enviar o e-mail. Tente novamente.");
    } finally {
      setSendingReset(false);
    }
  }

  if (loading) return <SkeletonPerfil />;

  return (
    <div className="space-y-6">

      {/* Page title */}
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-vinke-ink3 dark:text-vinke-ink3">Minha conta</div>
        <div className="mt-0.5 text-3xl font-black text-vinke-ink dark:text-slate-100">Perfil</div>
      </div>

      <PerfilStats />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* CARD PRINCIPAL — dados */}
        <div className="lg:col-span-2 rounded-2xl border border-vinke-line bg-white p-6 dark:border-vinke-navy-line dark:bg-vinke-navy-card">

          {/* Avatar + nome */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 dark:bg-vinke-line2">
                  <Image
                    src="/logo-icon.png"
                    alt="Logo"
                    width={64}
                    height={64}
                    className="h-full w-full object-cover opacity-10"
                  />
                </div>
                <div className="absolute inset-0 flex items-center justify-center text-xl font-black text-white dark:text-vinke-ink">
                  {initials(displayName || email)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-lg font-black text-vinke-ink truncate dark:text-slate-100">{displayName}</div>
                <div className="flex items-center gap-1.5 text-sm text-vinke-ink3 truncate dark:text-vinke-ink4">
                  <Mail size={13} />
                  {email}
                </div>
              </div>
            </div>

            {!editing ? (
              <Button variant="secondary" onClick={() => setEditing(true)} className="w-full gap-2 sm:w-auto">
                <Pencil size={14} />
                Editar
              </Button>
            ) : (
              <Button variant="secondary" onClick={cancelEdit} className="w-full gap-2 sm:w-auto">
                <X size={14} />
                Cancelar
              </Button>
            )}
          </div>

          {/* Seção: Dados pessoais */}
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-vinke-ink4 dark:text-vinke-ink2">
              <User size={11} />
              Dados pessoais
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
              <Field label="Nome completo" icon={User} value={name} onChange={setName}
                placeholder="Ex: João Silva" disabled={!editing} half />
              {/* Seletor de gênero */}
              <div className="sm:col-span-6">
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-vinke-ink3 dark:text-vinke-ink4">
                  Gênero
                </label>
                <div className="flex gap-2">
                  {[{ value: "M", label: "Masculino" }, { value: "F", label: "Feminino" }].map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      disabled={!editing}
                      onClick={() => setGender(gender === value ? "" : value)}
                      className={cn(
                        "flex-1 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition",
                        gender === value
                          ? "border-vinke bg-vinke text-white"
                          : "border-vinke-line bg-white text-vinke-ink2 hover:border-vinke-ink4 dark:border-vinke-navy-line dark:bg-vinke-navy-card dark:text-vinke-ink4",
                        !editing && "cursor-not-allowed opacity-60"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Telefone" icon={Phone} value={phone} onChange={setPhone}
                placeholder="Ex: (15) 99999-9999" disabled={!editing} half />
            </div>
          </div>

          {/* Seção: Endereço (necessário para NF) */}
          <div className="mt-5">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-vinke-ink4 dark:text-vinke-ink2">
              <MapPin size={11} />
              Endereço <span className="normal-case font-normal text-vinke-ink4">(para emissão de nota fiscal)</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
              <Field label="Rua / Avenida" value={addressStreet} onChange={setAddressStreet}
                placeholder="Ex: Av. Barão de Tatuí" disabled={!editing} />
              <Field label="Número" value={addressNumber} onChange={setAddressNumber}
                placeholder="Ex: 123" disabled={!editing} half />
              <Field label="Complemento" value={addressComplement} onChange={setAddressComplement}
                placeholder="Ex: Apto 12 / Bloco B" disabled={!editing} half />
              <Field label="Bairro" value={addressNeighborhood} onChange={setAddressNeighborhood}
                placeholder="Ex: Centro" disabled={!editing} half />
              <Field label="Cidade" value={addressCity} onChange={setAddressCity}
                placeholder="Ex: Sorocaba" disabled={!editing} half />
              <Field label="UF" value={addressState} onChange={setAddressState}
                placeholder="Ex: SP" disabled={!editing} half />
              <Field label="CEP" value={addressZip} onChange={setAddressZip}
                placeholder="Ex: 18000-000" disabled={!editing} half />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button onClick={onSave} disabled={!editing || saving} className="w-full gap-2 sm:w-auto">
              <Save size={14} />
              {saving ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </div>

        {/* CARD LATERAL — segurança */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-vinke-line bg-white p-5 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
            <div className="flex items-center gap-2 text-base font-black text-vinke-ink dark:text-slate-100">
              <KeyRound size={16} />
              Segurança
            </div>

            <div className="mt-4 rounded-2xl border border-vinke-line2 bg-vinke-offwhite p-4 dark:border-vinke-navy-line dark:bg-vinke-navy-sel">
              <div className="text-[11px] font-bold uppercase tracking-wide text-vinke-ink3 dark:text-vinke-ink4">E-mail de acesso</div>
              <div className="mt-1 break-all text-sm font-semibold text-vinke-ink dark:text-slate-100">{email}</div>
            </div>

            <div className="mt-3 rounded-2xl border border-vinke-line2 bg-vinke-offwhite p-4 dark:border-vinke-navy-line dark:bg-vinke-navy-sel">
              <div className="text-[11px] font-bold uppercase tracking-wide text-vinke-ink3 dark:text-vinke-ink4">Senha</div>
              <div className="mt-1 text-sm text-vinke-ink2 dark:text-slate-300 leading-relaxed">
                Para trocar sua senha, clique abaixo e você receberá um link no e-mail.
              </div>
            </div>

            <Button
              variant="secondary"
              onClick={resetPassword}
              disabled={sendingReset}
              className="mt-4 w-full gap-2"
            >
              <KeyRound size={14} />
              {sendingReset ? "Enviando…" : "Redefinir senha"}
            </Button>
          </div>

          {/* Logo card */}
          <div className="flex items-center gap-3 rounded-2xl border border-vinke-line bg-white p-4 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
            <Image src="/logo-icon.png" alt="Vinke" width={36} height={36}
              className="h-9 w-9 rounded-xl object-contain" />
            <div className="min-w-0">
              <div className="text-sm font-black text-vinke-ink truncate dark:text-slate-100">Vinke</div>
              <div className="text-xs text-vinke-ink3 dark:text-vinke-ink4">Área do Aluno</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Estatísticas históricas + marcos (design Canvas-3) ──────────────────────

type StatsSession = {
  status?: string;
  answeredCount?: number;
  correctCount?: number;
  updatedAt?: unknown;
};

function statsTsToMs(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "object" && v !== null) {
    const t = v as { toMillis?: () => number; seconds?: number };
    if (typeof t.toMillis === "function") return t.toMillis();
    if (typeof t.seconds === "number") return t.seconds * 1000;
  }
  return 0;
}

function PerfilStats() {
  const [loading2, setLoading2] = useState(true);
  const [respondidas, setRespondidas] = useState(0);
  const [simulados, setSimulados] = useState(0);
  const [streak, setStreak] = useState(0);
  const [serie, setSerie] = useState<Array<{ label: string; pct: number }>>([]);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) { setLoading2(false); return; }
    (async () => {
      try {
        const [sessSnap, statsSnap] = await Promise.all([
          getDocs(collection(db, "users", u.uid, "sessions")),
          getDoc(doc(db, "users", u.uid, "meta", "stats")),
        ]);
        const sessions = sessSnap.docs.map((d) => d.data() as StatsSession);
        setRespondidas(sessions.reduce((a, x) => a + Number(x.answeredCount ?? 0), 0));
        setSimulados(sessions.filter((x) => x.status === "completed").length);
        if (statsSnap.exists()) {
          const st = statsSnap.data() as { streakCount?: number; bestStreak?: number };
          setStreak(Number(st.bestStreak ?? st.streakCount ?? 0));
        }
        // evolução: acerto médio por mês (últimos 6 meses com dados)
        const porMes = new Map<string, { r: number; c: number }>();
        sessions.forEach((x) => {
          const ms = statsTsToMs(x.updatedAt);
          if (!ms) return;
          const d = new Date(ms);
          const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
          const agg = porMes.get(key) ?? { r: 0, c: 0 };
          agg.r += Number(x.answeredCount ?? 0);
          agg.c += Number(x.correctCount ?? 0);
          porMes.set(key, agg);
        });
        const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
        const pontos = Array.from(porMes.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-6)
          .filter(([, v]) => v.r > 0)
          .map(([k, v]) => ({
            label: meses[Number(k.split("-")[1])],
            pct: Math.round((v.c / v.r) * 100),
          }));
        setSerie(pontos);
      } finally {
        setLoading2(false);
      }
    })();
  }, []);

  if (loading2) {
    return <div className="h-40 animate-pulse rounded-2xl bg-vinke-line2 dark:bg-vinke-navy-sel" />;
  }

  const marcos = [
    { label: "100 questões", ok: respondidas >= 100 },
    { label: "500 questões", ok: respondidas >= 500 },
    { label: "1.000 questões", ok: respondidas >= 1000 },
    { label: "7 dias seguidos", ok: streak >= 7 },
    { label: "21 dias seguidos", ok: streak >= 21 },
    { label: "1º simulado completo", ok: simulados >= 1 },
  ];

  const w = 520;
  const h = 90;
  const pts = serie.length >= 2
    ? serie.map((p, i) => ({
        x: 10 + (i / (serie.length - 1)) * (w - 20),
        y: 10 + (1 - p.pct / 100) * (h - 20),
      }))
    : [];

  return (
    <div className="space-y-4">
      {serie.length >= 2 ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-white p-5 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <div className="flex items-center justify-between">
            <span className="font-display text-[13px] font-bold text-vinke-ink dark:text-white">Evolução do acerto</span>
            {serie[serie.length - 1].pct > serie[0].pct ? (
              <span className="rounded-full bg-vinke-green-soft px-2.5 py-0.5 text-[10px] font-bold text-vinke-green-text dark:bg-vinke-green/15 dark:text-vinke-green">
                ↑ +{serie[serie.length - 1].pct - serie[0].pct} pts no período
              </span>
            ) : null}
          </div>
          <svg viewBox={`0 0 ${w} ${h + 16}`} className="block w-full">
            <polyline
              points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              className="stroke-vinke dark:stroke-vinke-lav"
            />
            {pts.length ? (
              <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="5" className="fill-vinke-green" />
            ) : null}
            {serie.map((p, i) => (
              <text
                key={i}
                x={pts[i].x}
                y={h + 12}
                textAnchor="middle"
                fontSize="9"
                className="fill-vinke-ink3"
              >
                {p.label}
              </text>
            ))}
          </svg>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col rounded-2xl bg-white p-4 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <span className="text-[9px] font-semibold tracking-[0.1em] text-vinke-ink3">TOTAL DE QUESTÕES</span>
          <span className="font-display text-2xl font-bold text-vinke-ink dark:text-white [font-variant-numeric:tabular-nums]">
            {respondidas.toLocaleString("pt-BR")}
          </span>
        </div>
        <div className="flex flex-col rounded-2xl bg-white p-4 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <span className="text-[9px] font-semibold tracking-[0.1em] text-vinke-ink3">MELHOR SEQUÊNCIA</span>
          <span className="font-display text-2xl font-bold text-vinke-ink dark:text-white">
            {streak} {streak === 1 ? "dia" : "dias"}
          </span>
        </div>
        <div className="flex flex-col rounded-2xl bg-white p-4 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <span className="text-[9px] font-semibold tracking-[0.1em] text-vinke-ink3">SIMULADOS</span>
          <span className="font-display text-2xl font-bold text-vinke-ink dark:text-white">{simulados}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 rounded-2xl bg-white p-5 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card">
        <span className="font-display text-[13px] font-bold text-vinke-ink dark:text-white">Marcos</span>
        <div className="flex flex-wrap gap-2">
          {marcos.map((m) => (
            <span
              key={m.label}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-bold",
                m.ok
                  ? "bg-vinke-green-soft text-vinke-green-text dark:bg-vinke-green/15 dark:text-vinke-green"
                  : "border-[1.5px] border-dashed border-vinke-line font-semibold text-vinke-ink3 dark:border-vinke-navy-line"
              )}
            >
              {m.ok ? "✓ " : ""}
              {m.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
