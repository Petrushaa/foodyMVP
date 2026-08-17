"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

import { GlassSurface } from "@/components/feed/glass-surface";
import { Input } from "@/components/ui/input";
import { CodeStep } from "@/components/auth/code-step";
import {
  confirmPasswordReset,
  requestPasswordReset,
} from "@/app/actions/email-codes";
import { cn } from "@/lib/utils";

const FIELD_SURFACE = cn(
  "relative h-[50px] rounded-[18px] border border-white/65 bg-transparent",
  "shadow-[0_8px_20px_rgba(20,40,28,0.08),inset_1px_1px_0_rgba(255,255,255,0.72)]",
  "backdrop-blur-[16px] backdrop-saturate-[170%] transition-shadow duration-150",
  "focus-within:ring-2 focus-within:ring-[#15291C]/12",
);
const FIELD_INPUT =
  "h-[50px] border-0 bg-transparent pl-11 pr-3.5 py-0 text-[15.5px] leading-[50px] font-semibold text-[#15291C] shadow-none outline-none placeholder:text-[#8A958E] focus-visible:border-transparent focus-visible:ring-0";

/**
 * Восстановление пароля: адрес, потом код из письма и новый пароль сразу.
 *
 * Оба шага на одной странице, потому что код нигде не хранится: он живёт в
 * памяти формы ровно до отправки. Отдельная страница «введите новый пароль»
 * потребовала бы передавать код ссылкой — то есть светить его в адресной
 * строке и в истории браузера.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const router = useRouter();

  async function requestCode() {
    if (!email.trim()) {
      setError("Введите почту, на которую зарегистрирован аккаунт");
      return;
    }
    setIsPending(true);
    setError(null);
    const res = await requestPasswordReset(email.trim());
    setIsPending(false);
    // На 429 всё равно переходим к вводу кода: письмо уже отправлено раньше,
    // и человеку нужен именно ввод, а не повторная отправка.
    if (!res.ok && !res.retryAfter) {
      setError(res.error ?? "Не удалось отправить письмо.");
      return;
    }
    setAwaitingCode(true);
  }

  async function applyNewPassword(code: string) {
    if (password.length < 6) return "Пароль должен содержать не менее 6 символов";
    const res = await confirmPasswordReset(email.trim(), code, password);
    if (!res.ok) return res.error ?? "Неверный или устаревший код.";
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
              title="Новый пароль"
              hint="Введите код, который мы отправили на"
              submitLabel="Сохранить пароль"
              onSubmit={applyNewPassword}
              onBack={() => setAwaitingCode(false)}
              onResend={() => requestPasswordReset(email.trim())}
            >
              <GlassSurface className={FIELD_SURFACE}>
                <Lock className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-5 -translate-y-1/2 text-[#8A958E]" />
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Новый пароль"
                  autoComplete="new-password"
                  className={cn(FIELD_INPUT, "pr-12")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  className="absolute top-1/2 right-3 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full text-[#8A958E] hover:bg-white/40"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </GlassSurface>
            </CodeStep>
          ) : (
            <>
              <header className="mb-7 text-center">
                <h1 className="text-[28px] font-extrabold tracking-[-0.4px] text-[#15291C]">
                  Восстановление пароля
                </h1>
                <p className="mt-2 text-[14.5px] leading-[1.45] font-medium text-[#5C6B62]">
                  Укажите почту, на которую зарегистрирован аккаунт — пришлём код
                  для смены пароля
                </p>
              </header>

              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  requestCode();
                }}
                className="flex flex-1 flex-col gap-3"
              >
                <GlassSurface className={FIELD_SURFACE}>
                  <Mail className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-5 -translate-y-1/2 text-[#8A958E]" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Электронная почта"
                    required
                    autoComplete="email"
                    className={FIELD_INPUT}
                  />
                </GlassSurface>

                {error && (
                  <div className="rounded-2xl border border-red-300 bg-red-50/80 px-4 py-3 text-center text-[13px] font-semibold text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isPending}
                  className="mt-2 h-12 rounded-full bg-[#2ECC71] text-[16px] font-semibold text-white shadow-[0_8px_22px_rgba(46,204,113,0.35)] disabled:opacity-60"
                >
                  {isPending ? "Отправляем..." : "Отправить код"}
                </button>

                <div className="mt-auto pt-4 text-center text-[13px] font-medium text-[#5C6B62]">
                  Вспомнили пароль?{" "}
                  <Link href="/login" className="font-semibold text-[#1B7F45]">
                    Войти
                  </Link>
                </div>
              </form>
            </>
          )}
        </GlassSurface>
      </div>
    </main>
  );
}
