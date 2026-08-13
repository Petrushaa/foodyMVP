"use client";

// Модерация с клиента идёт через BFF-прокси /backend — Authorization
// подставляется из httpOnly-сессии на сервере, реальный JWT в браузер не
// передаётся. accessToken-параметр оставлен для совместимости (не используется;
// права staff проверяет бэкенд).

async function bePost(path: string, body?: unknown) {
    const res = await fetch(`/backend${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
    });
    if (!res.ok) {
        // Показываем модератору, что именно сказал бэк: «status 400» ничего
        // не объясняет, а причина отказа почти всегда в теле ответа.
        const data = await res.json().catch(() => null);
        throw new Error(explain(data) || `Ошибка ${res.status}`);
    }
    return res.json().catch(() => ({}));
}

/** Достаёт человекочитаемый текст из ответа DRF: {detail} или {поле: [текст]}. */
function explain(data: unknown): string {
    if (!data || typeof data !== "object") return "";
    const payload = data as Record<string, unknown>;
    if (typeof payload.detail === "string") return payload.detail;
    const first = Object.values(payload)[0];
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
    return typeof first === "string" ? first : "";
}

export async function approvePostClient(postId: number, _accessToken?: string) {
    try {
        await bePost(`/moderation/${postId}/approve`);
        return { success: true as const };
    } catch (e: any) {
        return { error: e?.message || "Ошибка одобрения" };
    }
}

export async function rejectPostClient(
    postId: number,
    reason: string,
    _accessToken?: string,
) {
    try {
        // Бэкенд ждёт поле reason; в модели оно хранится как rejection_reason.
        await bePost(`/moderation/${postId}/reject`, { reason: reason ?? "" });
        return { success: true as const };
    } catch (e: any) {
        return { error: e?.message || "Ошибка отклонения" };
    }
}
