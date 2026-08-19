"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from "lucide-react";

import { GlassSurface } from "@/components/feed/glass-surface";
import { Input } from "@/components/ui/input";
import { CodeStep } from "@/components/auth/code-step";
import {
  confirmPasswordReset,
  requestPasswordReset,
  verifyPasswordResetCode,
} from "@/app/actions/email-codes";
import { cn } from "@/lib/utils";
import { FIELD_SURFACE, FIELD_INPUT } from "@/components/ui/field-styles";

const MIN_PASSWORD = 6;

/**
 * Восстановление пароля: почта → код → новый пароль.
 *
 * Три отдельных шага, а не одна форма. Раньше код и пароль вводились вместе, и
 * про неверный код человек узнавал уже после того, как придумал новый пароль.
 *
 * Шаги — состояние одной страницы, а не разные адреса: код и пропуск живут в
 * памяти формы. Отдельные страницы потребовали бы передавать их ссылкой, то
 * есть светить в адресной строке и в истории браузера.
 */
export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [email, setEmail] = useState("");
  const [ticket, setTicket] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
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
    setStep("code");
  }

  /** Проверяет код и забирает пропуск на смену пароля. */
  async function checkCode(code: string) {
    const res = await verifyPasswordResetCode(email.trim(), code);
    if (!res.ok || !res.ticket) return res.error ?? "Неверный или устаревший код.";
    setTicket(res.ticket);
    setStep("password");
    return null;
  }

  async function savePassword() {
    if (password.length < MIN_PASSWORD) {
      setError(`Пароль должен содержать не менее ${MIN_PASSWORD} символов`);
      return;
    }
    setIsPending(true);
    setError(null);
    const res = await confirmPasswordReset(email.trim(), ticket, password);
    setIsPending(false);
    if (!res.ok) {
      setError(res.error ?? "Не удалось сменить пароль.");
      return;
    }
    router.push(res.needsLogin ? "/login" : "/me");
    router.refresh();
  }

  /** Возврат к началу: код уже потрачен, продолжить с него нельзя. */
  function startOver() {
    setTicket("");
    setPassword("");
    setError(null);
    setStep("email");
  }

  return (
    <main className="absolute inset-0 overflow-hidden bg-[#F6F7F6]">
      <div className="absolute inset-0 flex flex-col px-5 pt-14 pb-10">
        <GlassSurface className="flex flex-1 flex-col rounded-[26px] border border-white/65 bg-white/45 px-5 pt-8 pb-5 shadow-[0_8px_24px_rgba(20,40,28,0.10),0_2px_6px_rgba(20,40,28,0.06)]">
          {step === "code" && (
            <CodeStep
              email={email}
              title="Введите код"
              hint="Мы отправили код на"
              submitLabel="Продолжить"
              onSubmit={checkCode}
              onBack={startOver}
              onResend={() => requestPasswordReset(email.trim())}
            />
          )}

          {step === "password" && (
            <div className="flex flex-1 flex-col">
              <button
                type="button"
                onClick={startOver}
                className="mb-5 flex w-fit items-center gap-1.5 text-[13px] font-semibold text-[#5C6B62]"
              >
                <ArrowLeft className="size-4" />
                Назад
              </button>

              <header className="mb-7 text-center">
                <h1 className="text-[26px] font-extrabold tracking-[-0.4px] text-[#15291C]">
                  Новый пароль
                </h1>
                <p className="mt-2 text-[14.5px] leading-[1.45] font-medium text-[#5C6B62]">
                  Код подтверждён. Придумайте пароль, с которым будете входить
                </p>
              </header>

              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  savePassword();
                }}
                className="flex flex-1 flex-col gap-3"
              >
                <GlassSurface className={FIELD_SURFACE}>
                  <Lock className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-5 -translate-y-1/2 text-[#8A958E]" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Новый пароль"
                    autoComplete="new-password"
                    autoFocus
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
                  {isPending ? "Сохраняем..." : "Сохранить пароль"}
                </button>

                <p className="mt-auto pt-3 text-center text-[12px] leading-[1.5] font-medium text-[#8A958E]">
                  После сохранения мы сразу впустим вас в аккаунт
                </p>
              </form>
            </div>
          )}

          {step === "email" && (
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
