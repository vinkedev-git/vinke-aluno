"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { sendPasswordResetEmail } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
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
  if (!s) return "AQ";
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
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800/80 dark:bg-slate-900/50">
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
      const snap = await getDoc(doc(db, "users", u.uid));
      const d = (snap.exists() ? (snap.data() as ProfileData) : {}) || {};
      setData(d);
      setName(d.name || "");
      setPhone(d.phone || "");
      setAddressStreet(d.addressStreet || "");
      setAddressNumber(d.addressNumber || "");
      setAddressComplement(d.addressComplement || "");
      setAddressNeighborhood(d.addressNeighborhood || "");
      setAddressCity(d.addressCity || "");
      setAddressState(d.addressState || "");
      setAddressZip(d.addressZip || "");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  function cancelEdit() {
    setName(data.name || ""); setPhone(data.phone || "");
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
      const payload: ProfileData = {
        name: name.trim(), phone: phone.trim(),
        addressStreet: addressStreet.trim(), addressNumber: addressNumber.trim(),
        addressComplement: addressComplement.trim(), addressNeighborhood: addressNeighborhood.trim(),
        addressCity: addressCity.trim(), addressState: addressState.trim(),
        addressZip: addressZip.trim(),
        updatedAt: serverTimestamp(),
        createdAt: data.createdAt ? data.createdAt : serverTimestamp(),
        source: "user",
      };
      await setDoc(doc(db, "users", u.uid), payload, { merge: true });
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
      await sendPasswordResetEmail(auth, userEmail);
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
        <div className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">Minha conta</div>
        <div className="mt-0.5 text-3xl font-black text-slate-900 dark:text-slate-100">Perfil</div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* CARD PRINCIPAL — dados */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800/80 dark:bg-slate-900/50">

          {/* Avatar + nome */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 dark:bg-slate-100">
                  <Image
                    src="/logo-icon.png"
                    alt="Logo"
                    width={64}
                    height={64}
                    className="h-full w-full object-cover opacity-10"
                  />
                </div>
                <div className="absolute inset-0 flex items-center justify-center text-xl font-black text-white dark:text-slate-900">
                  {initials(displayName || email)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-lg font-black text-slate-900 truncate dark:text-slate-100">{displayName}</div>
                <div className="flex items-center gap-1.5 text-sm text-slate-500 truncate dark:text-slate-400">
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
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">
              <User size={11} />
              Dados pessoais
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
              <Field label="Nome completo" icon={User} value={name} onChange={setName}
                placeholder="Ex: Dr. João Silva" disabled={!editing} half />
              <Field label="Telefone" icon={Phone} value={phone} onChange={setPhone}
                placeholder="Ex: (15) 99999-9999" disabled={!editing} half />
            </div>
          </div>

          {/* Seção: Endereço (necessário para NF) */}
          <div className="mt-5">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">
              <MapPin size={11} />
              Endereço <span className="normal-case font-normal text-slate-400">(para emissão de nota fiscal)</span>
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
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800/80 dark:bg-slate-900/50">
            <div className="flex items-center gap-2 text-base font-black text-slate-900 dark:text-slate-100">
              <KeyRound size={16} />
              Segurança
            </div>

            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">E-mail de acesso</div>
              <div className="mt-1 break-all text-sm font-semibold text-slate-800 dark:text-slate-100">{email}</div>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Senha</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
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
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800/80 dark:bg-slate-900/50">
            <Image src="/logo-icon.png" alt="Anestesia Questões" width={36} height={36}
              className="h-9 w-9 rounded-xl object-contain" />
            <div className="min-w-0">
              <div className="text-sm font-black text-slate-900 truncate dark:text-slate-100">Anestesia Questões</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Área do Aluno</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
