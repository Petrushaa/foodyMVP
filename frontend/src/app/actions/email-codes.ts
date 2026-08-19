"use server";

import { signIn } from "@/auth";
import { explainApiError } from "@/lib/api-errors";

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
    return { ok: false, error: explainApiError(data, "Неверный или устаревший код.") };
}

/**
 * Запрос письма с кодом. Подтверждение почты и сброс пароля отличаются только
 * адресом ручки: и ответ, и разбор 429 у них одинаковые.
 */
async function requestCode(path: string, email: string): Promise<Result> {
    const { status, data } = await post(path, { email });
    if (status === 200) return { ok: true };
    if (status === 429) {
        return {
            ok: false,
            error: explainApiError(data, "Письмо уже отправлено."),
            // Сколько ждать — знает бэкенд; кнопка повтора считает по этому числу.
            retryAfter: data?.retry_after,
        };
    }
    return { ok: false, error: explainApiError(data, "Не удалось отправить письмо.") };
}

export async function resendEmailCode(email: string): Promise<Result> {
    return requestCode("/users/email/resend/", email);
}

export async function requestPasswordReset(email: string): Promise<Result> {
    return requestCode("/users/password/reset/", email);
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
    return { ok: false, error: explainApiError(data, "Неверный или устаревший код.") };
}
