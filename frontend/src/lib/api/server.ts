/**
 * Серверный слой API — только для server components и server actions.
 *
 * Здесь ходим напрямую на Django внутренним адресом и сами достаём токен из сессии.
 *
 * ⚠️ Не импортировать в клиентских компонентах: модуль тянет `auth()` и переменные
 * окружения. В браузере для этого есть `client.ts` — он ходит через BFF-прокси
 * и токена вообще не видит.
 */

import { auth } from "@/auth";
import type {
    DishType, MenuItem, MenuItemDetail, ModerationPost, ModerationStats,
    Paginated, Post, Restaurant, Taxon, UserProfile,
} from "@/lib/types";
import { type CatalogFilters, type FeedParams, endpoints } from "./endpoints";

const BACKEND =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://backend:8000/api/v1";

export class ApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = "ApiError";
    }
}

interface Options extends RequestInit {
    /** Читать без авторизации: лента и каталог открыты гостям. */
    anonymous?: boolean;
}

export async function serverFetch<T>(path: string, options: Options = {}): Promise<T> {
    const { anonymous, ...init } = options;

    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
    if (init.body && !(init.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    if (!anonymous) {
        const session = (await auth()) as { user?: { accessToken?: string } } | null;
        const token = session?.user?.accessToken;
        if (token) headers.Authorization = `Bearer ${token}`;
    }

    // Django требует завершающий слэш, а пути мы храним без него.
    const [pathname, search] = path.split("?");
    const url = `${BACKEND}${pathname}/${search ? `?${search}` : ""}`;

    const response = await fetch(url, { ...init, headers, cache: "no-store" });

    if (!response.ok) {
        let message = `Бэкенд ответил ${response.status}`;
        try {
            const data = await response.json();
            message = data?.detail || message;
        } catch {
            // не JSON — оставляем как есть
        }
        throw new ApiError(message, response.status);
    }
    return response.status === 204 ? (null as T) : response.json();
}

/**
 * Мягкий вариант: возвращает null вместо исключения. Удобен на страницах,
 * где отсутствие данных — не ошибка, а просто пустой блок.
 */
export async function tryFetch<T>(path: string, options?: Options): Promise<T | null> {
    try {
        return await serverFetch<T>(path, options);
    } catch {
        return null;
    }
}

// --- Открытые данные: доступны и гостю ------------------------------------

export const fetchFeed = (params?: FeedParams) =>
    serverFetch<Paginated<Post>>(endpoints.posts(params), { anonymous: false });

export const fetchPost = (id: number) => serverFetch<Post>(endpoints.post(id));

export const fetchMenuItem = (id: number) =>
    serverFetch<MenuItemDetail>(endpoints.menuItem(id));

export const fetchMenuItemPosts = (id: number, page?: number) =>
    serverFetch<Paginated<Post>>(endpoints.menuItemPosts(id, page));

export const fetchMenuItems = (filters?: CatalogFilters) =>
    serverFetch<Paginated<MenuItem>>(endpoints.menuItems(filters));

export const fetchRestaurant = (id: number) =>
    serverFetch<Restaurant>(endpoints.restaurant(id));

export const fetchRestaurantMenu = (id: number, page?: number) =>
    serverFetch<Paginated<MenuItem>>(endpoints.restaurantMenu(id, page));

// --- Справочники ----------------------------------------------------------

export const fetchDishTypes = () =>
    serverFetch<DishType[]>(endpoints.dishTypes(), { anonymous: true });

export const fetchTaxons = (kind?: string) =>
    serverFetch<Taxon[]>(endpoints.taxons(kind), { anonymous: true });

// --- Модерация ------------------------------------------------------------

export const fetchModerationQueue = (kind?: string, page?: number) =>
    serverFetch<Paginated<ModerationPost>>(endpoints.moderationQueue(kind, page));

export const fetchModerationStats = () =>
    serverFetch<ModerationStats>(endpoints.moderationStats());

// --- Пользователи ---------------------------------------------------------

export const fetchMe = () => serverFetch<UserProfile>(endpoints.me());

export const fetchUser = (id: number) => serverFetch<UserProfile>(endpoints.user(id));
