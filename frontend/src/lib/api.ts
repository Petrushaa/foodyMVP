
const isServer = typeof window === 'undefined';
// Сервер (SSR / server actions) ходит на бэкенд по внутреннему docker-хосту.
// Клиент (браузер) — ВСЕГДА относительным путём того же origin, чтобы не ловить
// mixed-content: страница открыта по https, а абсолютный http-URL из
// NEXT_PUBLIC_API_URL блокировался бы браузером ("Failed to fetch").
// Caddy проксирует /api/* на backend. Так же делает и лента (fetch("/api/v1...")).
const API_URL = isServer
    ? (process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1")
    : "/api/v1";

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${API_URL}${endpoint}`;
    
    // Default headers
    const headers: Record<string, string> = {
        ...options.headers as Record<string, string>,
    };

    // If body is NOT FormData, default to JSON
    if (!(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
        ...options,
        headers,
        cache: "no-store", // disable nextjs fetch caching just in case
    });

    if (!response.ok) {
        if (response.status === 401) {
            // Если токен невалиден или просрочен (401 Unauthorized), 
            // можем выбросить специальную ошибку или вернуть null/перенаправить:
            throw new Error("UNAUTHORIZED");
        }
        
        let errorMessage = "Произошла ошибка при запросе";
        try {
            const errorData = await response.json();
            errorMessage = errorData.detail || errorData.message || JSON.stringify(errorData);
        } catch (e) {
            // If not JSON
        }
        throw new Error(errorMessage);
    }

    // Handle 204 No Content
    if (response.status === 204) {
        return null;
    }

    return response.json();
}

export function fixMediaUrl(path: string | null | undefined): string | undefined {
    if (!path) return undefined;
    // Абсолютный URL — оставить, но срезать dev-хосты чтобы браузер не ломился на localhost/backend из прода
    if (/^https?:\/\//i.test(path)) {
        return path.replace(
            /^https?:\/\/(localhost|backend|0\.0\.0\.0|127\.0\.0\.1)(:\d+)?/,
            ""
        );
    }
    // Относительный путь — добавить ведущий слэш если нет, браузер сам подставит origin
    return path.startsWith("/") ? path : `/${path}`;
}

// Аватар лежит по СТАБИЛЬНОМУ URL (/media/avatars/uXX/avatar.webp) — при замене
// бэк перезаписывает тот же файл, поэтому браузер отдаёт старую картинку из кеша.
// Добавляем cache-busting ?v=... чтобы новый аватар показывался сразу.
// version: передавай стабильный токен (напр. дату), иначе — метка времени рендера.
export function fixAvatarUrl(
    path: string | null | undefined,
    version?: string | number,
): string | undefined {
    const url = fixMediaUrl(path);
    if (!url) return url;
    const v = version ?? Date.now();
    return url.includes("?") ? `${url}&v=${v}` : `${url}?v=${v}`;
}
