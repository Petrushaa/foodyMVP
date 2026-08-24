"use client";

import { explainApiError } from "@/lib/api-errors";

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
        throw new Error(explainApiError(data) || `Ошибка ${res.status}`);
    }
    return res.json().catch(() => ({}));
}


export async function approvePostClient(
    postId: number,
    _accessToken?: string,
    restaurantId?: number,
    dishTypeId?: number,
) {
    try {
        // restaurantId — модератор опознал место: блюдо заведётся в нём,
        // а не в новом заведении по написанию автора.
        // dishTypeId — система угадала блюдо неверно, модератор поправил.
        const body: Record<string, number> = {};
        if (restaurantId) body.restaurant_id = restaurantId;
        if (dishTypeId) body.dish_type_id = dishTypeId;

        await bePost(
            `/moderation/${postId}/approve`,
            Object.keys(body).length ? body : undefined,
        );
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
