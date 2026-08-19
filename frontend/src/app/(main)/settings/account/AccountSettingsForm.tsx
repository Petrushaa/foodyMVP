"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { GlassSurface } from "@/components/feed/glass-surface";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FIELD_SURFACE, FIELD_INPUT } from "@/components/ui/field-styles";

const CARD =
  "rounded-[22px] border border-white/65 bg-white/45 px-5 py-5 shadow-[0_8px_24px_rgba(20,40,28,0.10),0_2px_6px_rgba(20,40,28,0.06)]";
const LABEL =
  "mb-2 block text-[13px] font-bold tracking-[0.1em] text-[#5C6B62] uppercase";

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <GlassSurface className={FIELD_SURFACE}>
        <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-[#8A958E] z-10" />
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={cn(FIELD_INPUT, "pr-12")}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          tabIndex={-1}
          aria-label={show ? "Скрыть пароль" : "Показать пароль"}
          className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center size-8 rounded-full text-[#8A958E] hover:bg-white/40 z-10"
        >
          {show ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </GlassSurface>
    </div>
  );
}

export default function AccountSettingsForm({
  initialEmail,
}: {
  initialEmail: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    setNotice(null);

    if (!email.trim()) {
      setError("Введите электронную почту");
      return;
    }
    const wantsPasswordChange =
      currentPassword || newPassword || confirmPassword;
    if (wantsPasswordChange) {
      if (!currentPassword) {
        setError("Введите текущий пароль");
        return;
      }
      if (newPassword.length < 6) {
        setError("Новый пароль — минимум 6 символов");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("Новые пароли не совпадают");
        return;
      }
    }

    // Бэкенд пока не подключён — это заготовка UI.
    setNotice("Пока это демо: изменения не сохраняются (бэкенд не подключён).");
  }

  return (
    <main className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 flex flex-col pt-2">
        <header className="mb-2 flex items-center gap-3 px-5">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Назад"
            className="grid size-9 place-items-center rounded-full border border-white/65 bg-white/58 text-[#15291C] shadow-[0_8px_20px_rgba(20,40,28,0.14),inset_1px_1px_0_rgba(255,255,255,0.86)] backdrop-blur-[18px]"
          >
            <ArrowLeft className="size-[18px]" strokeWidth={2.35} />
          </button>
          <h1 className="text-[22px] font-extrabold tracking-[-0.3px] text-[#15291C]">
            Личные данные
          </h1>
        </header>

        <div className="hide-scroll flex-1 overflow-y-auto px-4 pb-25 pt-3">
          <div className="space-y-5">
            {/* Почта */}
            <div>
              <p className="mb-2 px-2 text-[11px] font-bold tracking-[0.18em] text-[#8A958E] uppercase">
                Почта
              </p>
              <GlassSurface className={CARD}>
                <label htmlFor="email" className={LABEL}>
                  Электронная почта
                </label>
                <GlassSurface className={FIELD_SURFACE}>
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-[#8A958E] z-10" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className={FIELD_INPUT}
                  />
                </GlassSurface>
              </GlassSurface>
            </div>

            {/* Смена пароля */}
            <div>
              <p className="mb-2 px-2 text-[11px] font-bold tracking-[0.18em] text-[#8A958E] uppercase">
                Смена пароля
              </p>
              <GlassSurface className={CARD}>
                <div className="space-y-4">
                  <PasswordField
                    id="current_password"
                    label="Текущий пароль"
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <PasswordField
                    id="new_password"
                    label="Новый пароль"
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder="Минимум 6 символов"
                    autoComplete="new-password"
                  />
                  <PasswordField
                    id="confirm_password"
                    label="Повторите новый пароль"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>
              </GlassSurface>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-300 bg-red-50/80 px-4 py-3 text-center text-[13px] font-semibold text-red-700">
                {error}
              </div>
            )}
            {notice && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50/80 px-4 py-3 text-center text-[13px] font-semibold text-amber-800">
                {notice}
              </div>
            )}

            <button
              type="button"
              onClick={handleSave}
              className="h-12 w-full rounded-full bg-[#2ECC71] text-[16px] font-semibold text-white shadow-[0_8px_22px_rgba(46,204,113,0.35)]"
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
