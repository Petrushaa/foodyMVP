"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";

import { GlassSurface } from "@/components/feed/glass-surface";
import { resendEmailCode } from "@/app/actions/email-codes";
import { cn } from "@/lib/utils";

const CODE_LENGTH = 6;
/** Столько же, сколько бэкенд держит паузу между письмами. */
const RESEND_SECONDS = 60;

/**
 * Ввод кода из письма.
 *
 * Один компонент на все случаи: после регистрации, при входе с
 * неподтверждённой почтой и при сбросе пароля — экран человеку показывается
 * один и тот же, различается только то, что происходит после.
 */
export function CodeStep({
    email,
    title,
    hint,
    submitLabel,
    onSubmit,
    onBack,
    canResend = true,
    onResend,
    children,
}: {
    email: string;
    title: string;
    hint?: string;
    submitLabel: string;
    /** Проверяет код. Возвращает текст ошибки или null, если всё прошло. */
    onSubmit: (code: string) => Promise<string | null>;
    onBack: () => void;
    /** Есть ли кнопка «отправить ещё раз». */
    canResend?: boolean;
    /** Чем слать повторно: подтверждение почты или код сброса пароля. */
    onResend?: () => Promise<{ error?: string; retryAfter?: number }>;
    /** Дополнительные поля — например новый пароль при сбросе. */
    children?: React.ReactNode;
}) {
    const [code, setCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);
    const [left, setLeft] = useState(RESEND_SECONDS);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Обратный отсчёт до повторной отправки. Бэкенд всё равно откажет раньше
    // времени, но человек не должен нажимать кнопку, чтобы это выяснить.
    useEffect(() => {
        if (left <= 0) return;
        const timer = window.setTimeout(() => setLeft((v) => v - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [left]);

    async function submit() {
        if (code.length < CODE_LENGTH) {
            setError(`Код состоит из ${CODE_LENGTH} цифр`);
            return;
        }
        setIsPending(true);
        setError(null);
        const message = await onSubmit(code);
        setIsPending(false);
        if (message) {
            setError(message);
            setCode("");
            inputRef.current?.focus();
        }
    }

    async function resend() {
        setError(null);
        const result = onResend
            ? await onResend()
            : await resendEmailCode(email);
        // Бэкенд знает точную паузу — она может отличаться от нашей.
        setLeft(result.retryAfter ?? RESEND_SECONDS);
        if (result.error) setError(result.error);
    }

    return (
        <div className="flex flex-1 flex-col">
            <button
                type="button"
                onClick={onBack}
                className="mb-5 flex w-fit items-center gap-1.5 text-[13px] font-semibold text-[#5C6B62]"
            >
                <ArrowLeft className="size-4" />
                Назад
            </button>

            <div className="mb-6 text-center">
                <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-[#2ECC71]/12">
                    <MailCheck className="size-7 text-[#1B7F45]" />
                </div>
                <h2 className="text-[22px] font-extrabold tracking-[-0.3px] text-[#15291C]">
                    {title}
                </h2>
                <p className="mt-2 text-[14px] leading-[1.45] font-medium text-[#5C6B62]">
                    {hint ?? "Мы отправили код на"}{" "}
                    <span className="font-bold text-[#15291C]">{email}</span>
                </p>
            </div>

            <form
                noValidate
                onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
                className="flex flex-1 flex-col gap-3"
            >
                <GlassSurface className="relative h-[62px] rounded-[18px] border border-white/65 bg-transparent shadow-[0_8px_20px_rgba(20,40,28,0.08),inset_1px_1px_0_rgba(255,255,255,0.72)] backdrop-blur-[16px] focus-within:ring-2 focus-within:ring-[#15291C]/12">
                    <input
                        ref={inputRef}
                        // inputMode + pattern поднимают цифровую клавиатуру на телефоне:
                        // искать цифры на буквенной раскладке ради шести знаков незачем.
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="one-time-code"
                        maxLength={CODE_LENGTH}
                        value={code}
                        onChange={(e) =>
                            setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))
                        }
                        placeholder="000000"
                        className="h-[62px] w-full bg-transparent text-center text-[30px] font-extrabold tracking-[12px] text-[#15291C] outline-none placeholder:text-[#C8D2CB]"
                    />
                </GlassSurface>

                {children}

                {error && (
                    <div className="rounded-2xl border border-red-300 bg-red-50/80 px-4 py-3 text-center text-[13px] font-semibold text-red-700">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={isPending || code.length < CODE_LENGTH}
                    className="mt-2 h-12 rounded-full bg-[#2ECC71] text-[16px] font-semibold text-white shadow-[0_8px_22px_rgba(46,204,113,0.35)] disabled:opacity-60"
                >
                    {isPending ? "Проверяем..." : submitLabel}
                </button>

                {canResend && (
                    <button
                        type="button"
                        onClick={resend}
                        disabled={left > 0}
                        className={cn(
                            "h-11 text-[13.5px] font-semibold",
                            left > 0 ? "text-[#A6B0AA]" : "text-[#1B7F45]",
                        )}
                    >
                        {left > 0
                            ? `Отправить ещё раз через ${left} с`
                            : "Отправить код ещё раз"}
                    </button>
                )}

                <p className="mt-auto pt-3 text-center text-[12px] leading-[1.5] font-medium text-[#8A958E]">
                    Письмо приходит в течение минуты. Если его нет — проверьте папку
                    «Спам».
                </p>
            </form>
        </div>
    );
}
