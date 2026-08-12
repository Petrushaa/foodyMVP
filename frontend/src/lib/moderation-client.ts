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
    if (!res.ok) throw new Error(`status ${res.status}`);
    return res.json().catch(() => ({}));
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
        await bePost(`/moderation/${postId}/reject`, { rejection_reason: reason ?? "" });
        return { success: true as const };
    } catch (e: any) {
        return { error: e?.message || "Ошибка отклонения" };
    }
}
