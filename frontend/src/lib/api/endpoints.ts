/**
 * Пути API и сборка query-строк. Общее для браузера и сервера — чтобы адреса
 * не разъезжались между слоями.
 *
 * Важно: пути пишутся БЕЗ завершающего слэша. Django его требует, но добавляет
 * BFF-прокси — если поставить слэш здесь, Next сделает лишний 308-редирект.
 */

export type FeedKind = "all" | "subscriptions" | "saved";
export type FeedOrdering = "new" | "popular";

export interface FeedParams {
    feed?: FeedKind;
    ordering?: FeedOrdering;
    author?: number;
    menuItem?: number;
    page?: number;
}

export interface CatalogFilters {
    cuisine?: string[];
    format?: string[];
    form?: string[];
    diet?: string[];
    restaurant?: number;
    page?: number;
}

function query(params: Record<string, string | number | undefined | null>) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
            search.set(key, String(value));
        }
    }
    const result = search.toString();
    return result ? `?${result}` : "";
}

export const endpoints = {
    // --- Лента и посты ---
    posts: (params: FeedParams = {}) =>
        `/posts${query({
            feed: params.feed === "all" ? undefined : params.feed,
            ordering: params.ordering === "popular" ? "popular" : undefined,
            author: params.author,
            menu_item: params.menuItem,
            page: params.page,
        })}`,
    post: (id: number) => `/posts/${id}`,
    postLike: (id: number) => `/posts/${id}/like`,
    postSave: (id: number) => `/posts/${id}/save`,

    // --- Комментарии ---
    comments: (postId: number) => `/comments${query({ post: postId })}`,
    comment: (id: number) => `/comments/${id}`,
    commentLike: (id: number) => `/comments/${id}/like`,

    // --- Каталог ---
    menuItems: (filters: CatalogFilters = {}) =>
        `/menu-items${query({
            cuisine: filters.cuisine?.join(","),
            format: filters.format?.join(","),
            form: filters.form?.join(","),
            diet: filters.diet?.join(","),
            restaurant: filters.restaurant,
            page: filters.page,
        })}`,
    menuItem: (id: number) => `/menu-items/${id}`,
    menuItemPosts: (id: number, page?: number) => `/menu-items/${id}/posts${query({ page })}`,
    /** Умный поиск позиций: опечатки, синонимы, латиница, неверная раскладка. */
    menuItemSearch: (text: string, restaurant?: number) =>
        `/menu-items/search${query({ text, restaurant })}`,

    restaurants: (city?: string, page?: number) => `/restaurants${query({ city, page })}`,
    restaurant: (id: number) => `/restaurants/${id}`,
    restaurantMenu: (id: number, page?: number) => `/restaurants/${id}/menu${query({ page })}`,

    // --- Справочники для формы создания поста ---
    dishTypes: () => "/dish-types",
    taxons: (kind?: string) => `/taxons${query({ kind })}`,

    // --- Заведения ---
    /**
     * Подсказки заведений. `ll` — центр поиска «долгота,широта».
     * Передавать обязательно: без окна поиска Яндекс отдаёт результаты по всей
     * стране, и человек в Москве получит кофейни из Санкт-Петербурга.
     */
    placeSuggest: (text: string, ll?: string, spn?: string) =>
        `/places/suggest${query({ text, ll, spn })}`,
    placeNotFound: () => "/places/not-found",

    // --- Модерация ---
    moderationQueue: (kind?: string, page?: number) => `/moderation${query({ kind, page })}`,
    moderationStats: () => "/moderation/stats",
    moderationApprove: (id: number) => `/moderation/${id}/approve`,
    moderationReject: (id: number) => `/moderation/${id}/reject`,

    // --- Пользователи ---
    me: () => "/users/me",
    user: (id: number) => `/users/${id}`,
    subscribe: (id: number) => `/users/${id}/subscribe`,
} as const;
