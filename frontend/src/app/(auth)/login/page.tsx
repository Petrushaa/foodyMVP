"use client";

import { authenticate } from "@/app/actions/auth";
import React, { useState, useTransition } from "react";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { GlassSurface } from "@/components/feed/glass-surface";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const FIELD_SURFACE = cn(
  "relative h-[50px] rounded-[18px] border border-white/65 bg-transparent",
  "shadow-[0_8px_20px_rgba(20,40,28,0.08),inset_1px_1px_0_rgba(255,255,255,0.72)]",
  "backdrop-blur-[16px] backdrop-saturate-[170%] transition-shadow duration-150",
  "focus-within:ring-2 focus-within:ring-[#15291C]/12",
);
const FIELD_INPUT =
  "h-[50px] border-0 bg-transparent pl-11 pr-3.5 py-0 text-[15.5px] leading-[50px] font-semibold text-[#15291C] shadow-none outline-none placeholder:text-[#8A958E] focus-visible:border-transparent focus-visible:ring-0";

export default function LoginPage() {
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit(formData: FormData) {
    if (!email.trim() || !password) {
      setErrorMessage("Пожалуйста, введите почту и пароль");
      return;
    }
    setErrorMessage("");
    startTransition(() => {
      authenticate(undefined, formData)
        .then((err) => err && setErrorMessage(err))
        .catch(() => setErrorMessage("Не удалось войти"));
    });
  }

  return (
    <main className="absolute inset-0 overflow-hidden bg-[#F6F7F6]">
      <div className="absolute inset-0 flex flex-col px-5 pt-14 pb-10">
        <GlassSurface className="flex flex-1 flex-col rounded-[26px] border border-white/65 bg-white/45 px-5 pt-8 pb-5 shadow-[0_8px_24px_rgba(20,40,28,0.10),0_2px_6px_rgba(20,40,28,0.06)]">
          <header className="mb-7 text-center">
            <h1 className="text-[40px] font-extrabold tracking-[-0.5px] text-[#15291C]">Foody</h1>
            <p className="mt-2 text-[14.5px] leading-[1.45] font-medium text-[#5C6B62]">
              С возвращением! Войдите, чтобы делиться отзывами и сохранять любимые блюда
            </p>
          </header>

          <form noValidate action={submit} className="flex flex-1 flex-col gap-3">
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

            <GlassSurface className={FIELD_SURFACE}>
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-[#8A958E] z-10" />
              <Input
                type={showPassword ? "text" : "password"}
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
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

            {errorMessage && (
              <div className="rounded-2xl border border-red-300 bg-red-50/80 px-4 py-3 text-center text-[13px] font-semibold text-red-700">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="mt-2 h-12 rounded-full bg-[#2ECC71] text-white text-[16px] font-semibold shadow-[0_8px_22px_rgba(46,204,113,0.35)] disabled:opacity-60"
            >
              {isPending ? "Вход..." : "Войти"}
            </button>

            <div className="mt-auto pt-4 text-center text-[13px] font-medium text-[#5C6B62]">
              Нет аккаунта?{" "}
              <Link href="/register" className="font-semibold text-[#1B7F45]">
                Зарегистрироваться
              </Link>
            </div>
          </form>
        </GlassSurface>
      </div>
    </main>
  );
}
