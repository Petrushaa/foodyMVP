"use server";

import { signIn } from "@/auth";
import { explainApiError } from "@/lib/api-errors";
import { apiRequest } from "@/lib/api";

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

type Result = {
    ok: boolean;
    /** Текст для человека. */
    error?: string;
    /** Сколько секунд до следующего письма — бэкенд отвечает этим на 429. */
    retryAfter?: number;
    /** Код подошёл, но войти не удалось: нужен обычный вход по паролю. */
    needsLogin?: boolean;
};

/**
 * Запрос к бэкенду, где важен не только текст ошибки, но и её статус.
 *
 * Возвращает статус, а не бросает: здесь 429 и 400 — не сбои, а часть
 * разговора. На 429 показываем отсчёт, на 400 — «неверный код».
 */
async function post(path: string, body: unknown) {
    try {
        const data = await apiRequest(path, { method: "POST", body: JSON.stringify(body) });
        return { status: 200, data };
    } catch (e: any) {
        return { status: e?.status ?? 0, data: e?.data ?? null };
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

/**
 * Первый шаг смены пароля: код в обмен на разовый пропуск.
 *
 * Пропуск нужен потому, что код тратится здесь же. Спрашивать его второй раз
 * на экране пароля означало бы показывать ошибку ввода кода человеку, который
 * уже придумал новый пароль.
 */
export async function verifyPasswordResetCode(
    email: string,
    code: string,
): Promise<Result & { ticket?: string }> {
    const { status, data } = await post("/users/password/reset/verify/", { email, code });
    if (status === 200) return { ok: true, ticket: data?.ticket };
    if (status === 0) return { ok: false, error: "Сервер не отвечает. Попробуйте ещё раз." };
    return { ok: false, error: explainApiError(data, "Неверный или устаревший код.") };
}

/** Второй шаг: новый пароль по пропуску. */
export async function confirmPasswordReset(
    email: string,
    ticket: string,
    password: string,
): Promise<Result> {
    const { status, data } = await post("/users/password/reset/confirm/", {
        ticket,
        password,
        password_confirm: password,
    });
    if (status === 200) return signInAfterCode(email, password);
    if (status === 0) return { ok: false, error: "Сервер не отвечает. Попробуйте ещё раз." };
    return {
        ok: false,
        error: explainApiError(data, "Не удалось сменить пароль. Запросите код заново."),
    };
}
