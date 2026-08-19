"use client";

import React, { useState } from "react";
import { registerUser } from "@/app/actions/auth";
import { verifyEmailCode } from "@/app/actions/email-codes";
import { CodeStep } from "@/components/auth/code-step";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { User, Mail, Lock, MapPin, Eye, EyeOff } from "lucide-react";
import { GlassSurface } from "@/components/feed/glass-surface";
import { CitySelect, CITIES } from "@/components/ui/city-select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FIELD_SURFACE, FIELD_INPUT } from "@/components/ui/field-styles";


export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  // Пароль держим в памяти формы, чтобы после ввода кода открыть сессию
  // самим: заставлять человека набирать его ещё раз незачем. Никуда не
  // сохраняется — обновил страницу, и шаг начинается заново.
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(formData: FormData) {
    if (!name.trim() || !email.trim() || !city.trim() || !password) {
      setError("Пожалуйста, заполните все поля");
      return;
    }
    if (!CITIES.includes(city as (typeof CITIES)[number])) {
      setError("Выберите город из списка");
      return;
    }
    if (password.length < 6) {
      setError("Пароль должен содержать не менее 6 символов");
      return;
    }
    setIsPending(true);
    setError(null);
    const res = await registerUser(formData);
    setIsPending(false);
    if (res?.error) {
      setError(res.error);
    } else {
      setAwaitingCode(true);
    }
  }

  async function checkCode(code: string) {
    const res = await verifyEmailCode(email, code, password);
    if (!res.ok) return res.error ?? "Неверный или устаревший код.";
    // Сессия не открылась — аккаунт при этом уже подтверждён, поэтому
    // отправляем на обычный вход, а не показываем ошибку.
    router.push(res.needsLogin ? "/login" : "/me");
    router.refresh();
    return null;
  }

  return (
    <main className="absolute inset-0 overflow-hidden bg-[#F6F7F6]">
      <div className="absolute inset-0 flex flex-col px-5 pt-14 pb-10">
        <GlassSurface className="flex flex-1 flex-col rounded-[26px] border border-white/65 bg-white/45 px-5 pt-8 pb-5 shadow-[0_8px_24px_rgba(20,40,28,0.10),0_2px_6px_rgba(20,40,28,0.06)]">
          {awaitingCode ? (
            <CodeStep
              email={email}
              title="Подтвердите почту"
              submitLabel="Подтвердить"
              onSubmit={checkCode}
              onBack={() => setAwaitingCode(false)}
            />
          ) : (
          <>
          <header className="mb-7 text-center">
            <h1 className="text-[40px] font-extrabold tracking-[-0.5px] text-[#15291C]">Foody</h1>
            <p className="mt-2 text-[14.5px] leading-[1.45] font-medium text-[#5C6B62]">
              Присоединяйтесь, чтобы находить лучшие блюда и заведения
            </p>
          </header>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(new FormData(e.currentTarget));
            }}
            className="flex flex-1 flex-col gap-3"
          >
            <GlassSurface className={FIELD_SURFACE}>
              <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-[#8A958E] z-10" />
              <Input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ваше имя"
                required
                className={FIELD_INPUT}
              />
            </GlassSurface>

            <GlassSurface className={FIELD_SURFACE}>
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-[#8A958E] z-10" />
              <Input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Электронная почта"
                required
                autoComplete="email"
                className={FIELD_INPUT}
              />
            </GlassSurface>

            <CitySelect
              name="city"
              value={city}
              onChange={setCity}
              surfaceClassName={FIELD_SURFACE}
              inputClassName={FIELD_INPUT}
              icon={
                <MapPin className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-[#8A958E] z-10" />
              }
            />

            <GlassSurface className={FIELD_SURFACE}>
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-[#8A958E] z-10" />
              <Input
                type={showPassword ? "text" : "password"}
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete="new-password"
                className={cn(FIELD_INPUT, "pr-12")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 grid place-items-center size-8 rounded-full text-[#8A958E] hover:bg-white/40 z-10"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </GlassSurface>

            {error && (
              <div className="rounded-2xl border border-red-300 bg-red-50/80 px-4 py-3 text-center text-[13px] font-semibold text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="mt-2 h-12 rounded-full bg-[#2ECC71] text-white text-[16px] font-semibold shadow-[0_8px_22px_rgba(46,204,113,0.35)] disabled:opacity-60"
            >
              {isPending ? "Регистрация..." : "Зарегистрироваться"}
            </button>

            <div className="mt-auto pt-4 text-center text-[13px] font-medium text-[#5C6B62]">
              Уже есть аккаунт?{" "}
              <Link href="/login" className="font-semibold text-[#1B7F45]">
                Войти
              </Link>
            </div>

            <p className="pt-3 text-center text-[10px] tracking-[0.2em] text-[#A6B0AA] uppercase">
              Продолжая, вы соглашаетесь с политикой конфиденциальности Foody
            </p>
          </form>
          </>
          )}
        </GlassSurface>
      </div>
    </main>
  );
}
