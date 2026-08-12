// Клиентские мутации идут через BFF-прокси /backend (server route), который
// подставляет Authorization из httpOnly-сессии. Реальный JWT в браузер НЕ
// передаётся. Токен-параметр оставлен опциональным только для совместимости
// сигнатур вызовов — здесь он не используется.
const API_BASE = "/backend";

async function beFetch(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (init.body && !(init.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function toggleLike(postId: number, _token?: string) {
  const res = await beFetch(`/posts/${postId}/like`, { method: "POST" });
  if (!res.ok) throw new Error(`like failed: ${res.status}`);
  return res.json().catch(() => ({}));
}

export async function toggleSave(postId: number, _token?: string) {
  const res = await beFetch(`/posts/${postId}/save_post`, { method: "POST" });
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
  return res.json().catch(() => ({}));
}

export async function toggleFollow(
  username: string,
  targetUserId: number | null,
  _token: string | undefined,
  nextFollowing: boolean,
) {
  if (!targetUserId) throw new Error("targetUserId required");
  const res = await beFetch(`/users/${targetUserId}/subscribe`, {
    method: nextFollowing ? "POST" : "DELETE",
  });
  if (!res.ok) throw new Error(`follow failed: ${res.status}`);
  return res.json().catch(() => ({}));
}
