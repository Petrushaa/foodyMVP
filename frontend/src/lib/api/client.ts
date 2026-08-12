"use client";

/**
 * Клиентский слой API — только для браузера.
 *
 * Ходим на `/backend/...`, а не напрямую на Django: BFF-прокси читает httpOnly-сессию
 * и сам подставляет `Authorization`. Токен доступа так никогда не попадает
 * в клиентский бандл. Плюс это тот же origin, значит нет ни CORS, ни mixed-content.
 */

import type {
    Comment, DishType, MenuItem, MenuItemDetail, ModerationPost, Paginated, PlaceSuggestion,
    Post, Restaurant, Taxon, ToggleState,
} from "@/lib/types";
import { type CatalogFilters, type FeedParams, endpoints } from "./endpoints";

const BFF = "/backend";

export class ApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly fields?: Record<string, string[]>,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
    // FormData сам расставит boundary — руками Content-Type не трогаем.
    if (init.body && !(init.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${BFF}${path}`, { ...init, headers, cache: "no-store" });

    if (!response.ok) {
        throw await toError(response);
    }
    return response.status === 204 ? (null as T) : response.json();
}

async function toError(response: Response) {
    let message = "Что-то пошло не так";
    let fields: Record<string, string[]> | undefined;

    try {
        const data = await response.json();
        if (typeof data?.detail === "string") {
            message = data.detail;
        } else if (Array.isArray(data?.non_field_errors)) {
            message = data.non_field_errors.join(" ");
        } else if (data && typeof data === "object") {
            // DRF отдаёт ошибки полей объектом — сохраняем их, чтобы форма
            // могла подсветить конкретное поле, а не показывать общий текст.
            fields = data;
            const first = Object.values(data)[0];
            if (Array.isArray(first) && typeof first[0] === "string") message = first[0];
        }
    } catch {
        // Не JSON — оставляем общее сообщение.
    }

    if (response.status === 401) message = "Нужно войти";
    if (response.status === 403 && message === "Что-то пошло не так") message = "Нет доступа";
    return new ApiError(message, response.status, fields);
}

// --- Лента и посты --------------------------------------------------------

export const getPosts = (params?: FeedParams) =>
    request<Paginated<Post>>(endpoints.posts(params));

export const getPost = (id: number) => request<Post>(endpoints.post(id));

export const deletePost = (id: number) =>
    request<null>(endpoints.post(id), { method: "DELETE" });

/** POST ставит лайк, DELETE снимает. Повторный вызов дубля не создаёт. */
export const toggleLike = (id: number, active: boolean) =>
    request<ToggleState>(endpoints.postLike(id), { method: active ? "POST" : "DELETE" });

export const toggleSave = (id: number, active: boolean) =>
    request<ToggleState>(endpoints.postSave(id), { method: active ? "POST" : "DELETE" });

// --- Комментарии ----------------------------------------------------------

export const getComments = (postId: number) =>
    request<Paginated<Comment>>(endpoints.comments(postId));

export const addComment = (postId: number, text: string) =>
    request<Comment>("/comments", {
        method: "POST",
        body: JSON.stringify({ post: postId, text }),
    });

export const deleteComment = (id: number) =>
    request<null>(endpoints.comment(id), { method: "DELETE" });

export const toggleCommentLike = (id: number, active: boolean) =>
    request<ToggleState>(endpoints.commentLike(id), { method: active ? "POST" : "DELETE" });

// --- Каталог --------------------------------------------------------------

export const getMenuItems = (filters?: CatalogFilters) =>
    request<Paginated<MenuItem>>(endpoints.menuItems(filters));

export const getMenuItem = (id: number) =>
    request<MenuItemDetail>(endpoints.menuItem(id));

export const getMenuItemPosts = (id: number, page?: number) =>
    request<Paginated<Post>>(endpoints.menuItemPosts(id, page));

/**
 * Умный поиск позиций при создании поста. Ищет и среди позиций без постов —
 * иначе человек не найдёт только что созданную и заведёт дубль.
 */
export const searchMenuItems = (text: string, restaurant?: number) =>
    request<MenuItem[]>(endpoints.menuItemSearch(text, restaurant));

export const getRestaurant = (id: number) =>
    request<Restaurant>(endpoints.restaurant(id));

export const getRestaurantMenu = (id: number, page?: number) =>
    request<Paginated<MenuItem>>(endpoints.restaurantMenu(id, page));

// --- Справочники ----------------------------------------------------------

export const getDishTypes = () => request<DishType[]>(endpoints.dishTypes());

export const getTaxons = (kind?: string) => request<Taxon[]>(endpoints.taxons(kind));

// --- Заведения ------------------------------------------------------------

/**
 * Подсказки заведений при вводе — из нашего справочника.
 *
 * Это главная защита от дублей: увидев, что место уже заведено, человек выберет
 * его, а не создаст второе. Поэтому подсказки надо показывать заметно и рано.
 */
export const suggestPlaces = (text: string, city?: string) =>
    request<PlaceSuggestion[]>(endpoints.placeSuggest(text, city));

/** «Не нашёл своё место» — копим то, что люди не смогли найти на карте. */
export const reportPlaceNotFound = (query: string, comment: string) =>
    request<unknown>(endpoints.placeNotFound(), {
        method: "POST",
        body: JSON.stringify({ query, comment }),
    });

// --- Создание поста -------------------------------------------------------

export interface CreatePostInput {
    /** Либо выбрана существующая позиция… */
    menuItemId?: number;
    /** …либо заявка на новую. Заведение: выбранное из подсказок… */
    restaurantId?: number;
    /** …либо введённое руками — тогда нужны все три поля. */
    restaurantName?: string;
    restaurantAddress?: string;
    restaurantCity?: string;
    menuItemName?: string;
    dishTypeId?: number;
    taxonIds?: number[];

    authorRating: number;
    description?: string;
    size?: string;
    /** Обязательна при создании новой позиции; иначе — заявка «цена изменилась». */
    price?: number;
    tags?: string[];
    images?: File[];
}

export async function createPost(input: CreatePostInput) {
    const form = new FormData();
    const put = (key: string, value: unknown) => {
        if (value !== undefined && value !== null && value !== "") form.append(key, String(value));
    };

    put("menu_item_id", input.menuItemId);
    put("restaurant_id", input.restaurantId);
    put("restaurant_name", input.restaurantName);
    put("restaurant_address", input.restaurantAddress);
    put("restaurant_city", input.restaurantCity);
    put("menu_item_name", input.menuItemName);
    put("dish_type_id", input.dishTypeId);
    put("author_rating", input.authorRating);
    put("description", input.description);
    put("size", input.size);
    put("price", input.price);

    input.taxonIds?.forEach((id) => form.append("taxon_ids", String(id)));
    input.tags?.forEach((tag) => form.append("tags_list", tag));
    input.images?.forEach((file) => form.append("uploaded_images", file));

    return request<Post>("/posts", { method: "POST", body: form });
}


// --- Модерация ------------------------------------------------------------

export interface ApproveInput {
    /** Привязать к существующей позиции вместо создания новой — так склеиваются дубли. */
    menuItemId?: number;
    /** Поправленное название позиции, если автор написал криво. */
    menuItemName?: string;
    /** Решение по предложенной цене — отдельное от решения по посту. */
    acceptPrice?: boolean;
}

export const approveModerationPost = (id: number, input: ApproveInput = {}) =>
    request<ModerationPost>(endpoints.moderationApprove(id), {
        method: "POST",
        body: JSON.stringify({
            menu_item_id: input.menuItemId,
            menu_item_name: input.menuItemName,
            accept_price: input.acceptPrice ?? true,
        }),
    });

export const rejectModerationPost = (id: number, reason: string) =>
    request<ModerationPost>(endpoints.moderationReject(id), {
        method: "POST",
        body: JSON.stringify({ reason }),
    });
