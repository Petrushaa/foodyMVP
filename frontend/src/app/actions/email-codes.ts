"use server";

import { signIn } from "@/auth";

/**
 * Подтверждение почты и сброс пароля.
 *
 * Серверными действиями, а не запросами из браузера, по двум причинам: адрес
 * бэкенда не уезжает в клиентский бандл, и сразу после подтверждения кода
 * можно открыть сессию — вход живёт на сервере.
 *
 * Пароль сюда приходит из памяти формы, той же дорогой, что и при обычном
 * входе. Нигде не сохраняется: перезагрузил страницу — вводи заново.
 */

const API_URL =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000/api/v1";

type Result = {
    ok: boolean;
    /** Текст для человека. */
    error?: string;
    /** Сколько секунд до следующего письма — бэкенд отвечает этим на 429. */
    retryAfter?: number;
    /** Код подошёл, но войти не удалось: нужен обычный вход по паролю. */
    needsLogin?: boolean;
};

async function post(path: string, body: unknown) {
    try {
        const res = await fetch(`${API_URL}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
        });
        const data = await res.json().catch(() => null);
        return { status: res.status, data };
    } catch {
        return { status: 0, data: null };
    }
}

/** Достаёт человекочитаемый текст из ответа DRF: {detail} или {поле: [текст]}. */
function explain(data: any, fallback: string) {
    if (!data || typeof data !== "object") return fallback;
    if (typeof data.detail === "string") return data.detail;
    const first = Object.values(data)[0];
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
    return typeof first === "string" ? first : fallback;
}

/** Открывает сессию после того, как код подтвердил владение ящиком. */
async function signInAfterCode(email: string, password?: string): Promise<Result> {
    if (!password) return { ok: true, needsLogin: true };
    try {
        await signIn("credentials", { email, password, redirect: false });
        return { ok: true };
    } catch {
        // Аккаунт в порядке, подтверждение прошло — не хватило только сессии.
        return { ok: true, needsLogin: true };
    }
}

export async function verifyEmailCode(
    email: string,
    code: string,
    password?: string,
): Promise<Result> {
    const { status, data } = await post("/users/email/verify/", { email, code });
    if (status === 200) return signInAfterCode(email, password);
    if (status === 0) return { ok: false, error: "Сервер не отвечает. Попробуйте ещё раз." };
    return { ok: false, error: explain(data, "Неверный или устаревший код.") };
}

export async function resendEmailCode(email: string): Promise<Result> {
    const { status, data } = await post("/users/email/resend/", { email });
    if (status === 200) return { ok: true };
    if (status === 429) {
        return {
            ok: false,
            error: explain(data, "Письмо уже отправлено."),
            retryAfter: data?.retry_after,
        };
    }
    return { ok: false, error: explain(data, "Не удалось отправить письмо.") };
}

export async function requestPasswordReset(email: string): Promise<Result> {
    const { status, data } = await post("/users/password/reset/", { email });
    if (status === 200) return { ok: true };
    if (status === 429) {
        return {
            ok: false,
            error: explain(data, "Письмо уже отправлено."),
            retryAfter: data?.retry_after,
        };
    }
    return { ok: false, error: explain(data, "Не удалось отправить письмо.") };
}

export async function confirmPasswordReset(
    email: string,
    code: string,
    password: string,
): Promise<Result> {
    const { status, data } = await post("/users/password/reset/confirm/", {
        email,
        code,
        password,
        password_confirm: password,
    });
    if (status === 200) return signInAfterCode(email, password);
    if (status === 0) return { ok: false, error: "Сервер не отвечает. Попробуйте ещё раз." };
    return { ok: false, error: explain(data, "Неверный или устаревший код.") };
}
