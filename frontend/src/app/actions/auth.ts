"use server";

import { apiRequest } from "@/lib/api";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

export async function registerUser(formData: FormData) {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const city = (formData.get("city") as string)?.trim() ?? "";

    if (!name || !email || !password || !city) {
        return { error: "Все поля обязательны" };
    }

    try {
        // username = чистый email-префикс. Если кто-то уже занял такой —
        // бэк ответит 400 с сообщением, фронт покажет это юзеру.
        // Раньше тут добавлялось `+ "_" + Math.floor(Math.random()*1000)` —
        // получались уродливые ники user_520 даже когда коллизии нет.
        const registrationData = {
            username: email.split('@')[0].toLowerCase(),
            email,
            password,
            password_confirm: password,
            full_name: name,
            city,
        };

        await apiRequest("/users/register/", {
            method: "POST",
            body: JSON.stringify(registrationData),
        });

        // Автовхода здесь больше нет: пока не введён код из письма, бэкенд
        // не пустит. Дальше форма показывает ввод кода.
        return { success: true, needsVerification: true };
    } catch (error: any) {
        console.error("Registration error:", error);

        // Django отвечает ошибками по полям: {"email": ["уже занят"], …}.
        // Раньше их доставали через JSON.parse(error.message) — текст ошибки
        // собирали строкой и тут же разбирали обратно. Теперь тело ответа
        // приходит в самой ошибке.
        const FIELD_LABELS: Record<string, string> = {
            username: "Логин",
            email: "Email",
            password: "Пароль",
            password_confirm: "Подтверждение пароля",
            full_name: "Имя",
            city: "Город",
            non_field_errors: "Ошибка",
        };

        const data = error?.data;
        if (data && typeof data === "object") {
            const details = Object.entries(data)
                .map(([key, value]) => {
                    const label = FIELD_LABELS[key] || key;
                    const val = Array.isArray(value) ? value[0] : value;
                    return `${label}: ${val}`;
                })
                .join(". ");
            if (details) return { error: details };
        }

        return { error: error?.message || "Ошибка при регистрации" };
    }
}

/**
 * Почему вход не прошёл.
 *
 * next-auth сводит любую неудачу к одному и тому же отказу, поэтому причину
 * спрашиваем у бэкенда отдельно — и только когда вход уже не удался, чтобы не
 * ходить дважды в обычном случае.
 */
async function loginFailureReason(email: string, password: string) {
    const API_URL =
        process.env.INTERNAL_API_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        "http://localhost:8000/api/v1";
    try {
        const res = await fetch(`${API_URL}/auth/token/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
            cache: "no-store",
        });
        if (res.status === 403) {
            const data = await res.json().catch(() => null);
            if (data?.code === "email_not_verified") return "email_not_verified";
        }
    } catch {
        // Не достучались — покажем обычную ошибку входа.
    }
    return null;
}

export async function authenticate(prevState: string | undefined, formData: FormData) {
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    try {
        const result = await signIn("credentials", {
            ...Object.fromEntries(formData),
            redirect: false,
        });

        // В NextAuth v5 signIn с redirect: false может возвращать объект с ошибкой, а не выбрасывать исключение
        if (result?.error) {
            return (await loginFailureReason(email, password)) ?? "Неверный email или пароль";
        }
    } catch (error) {
        if (error instanceof AuthError) {
            const reason = await loginFailureReason(email, password);
            if (reason) return reason;
            switch ((error as any).type) {
                case "CredentialsSignin":
                    return "Неверный email или пароль";
                default:
                    return "Произошла ошибка при входе";
            }
        }
        // Если это не редирект и не AuthError, логируем и возвращаем ошибку
        console.error("Auth Exception:", error);
        return "Неверный email или пароль"; // fallback
    }

    redirect("/me");
}
