/**
 * Типы API. Один в один с сериализаторами бэкенда — если тут что-то не сходится,
 * значит расходится с реальностью, и чинить надо здесь, а не подгонять компоненты.
 *
 * Устройство коротко (подробности — docs/backend-v2-plan.md):
 * - Позиция (MenuItem) — блюдо в конкретном заведении, к ней привязаны все посты.
 * - Пост — рассказ про позицию с оценкой автора. До одобрения модератором позиции
 *   и заведения в каталоге ещё нет, поэтому пост несёт «заявку на размещение».
 */

/** Ось категорий. Кухня, формат и форма — по одному значению, «дополнительно» — сколько угодно. */
export type TaxonKind = "cuisine" | "format" | "form" | "diet";

export interface Taxon {
    id: number;
    kind: TaxonKind;
    name: string;
    slug: string;
}

/** Справочник блюд: пользователь выбирает тип, категории подставляются отсюда. */
export interface DishType {
    id: number;
    name: string;
    default_taxons: Taxon[];
}

export interface Restaurant {
    id: number;
    name: string;
    address: string;
    city: string;
    is_closed: boolean;
    posts_count: number;
    /** Сколько разных людей о нём писали. */
    contributors_count: number;
    /** Подтверждено, когда написали двое разных. Неподтверждённые не в каталоге. */
    is_confirmed: boolean;
}

export interface MenuItem {
    id: number;
    name: string;
    restaurant: Restaurant;
    dish_type: string | null;
    taxons: Taxon[];
    /** Цена в рублях. Задаёт создатель позиции, дальше меняется только через модерацию. */
    price: string | null;
    price_confirmed_at: string | null;
    /** Среднее — его и показываем пользователю. */
    rating_raw: number;
    ratings_count: number;
    posts_count: number;
}

/** Рейтинг блюда по всей сети — есть только у сетевых заведений. */
export interface BrandRating {
    rating_raw: number;
    rating: number;
    ratings_count: number;
    restaurants_count: number;
}

export interface MenuItemDetail extends MenuItem {
    /** Только теги, которые написали несколько разных людей. */
    tags: Array<{ id: number; name: string; mentions: number }>;
    brand_rating: BrandRating | null;
}

/** Профиль пользователя. */
export interface UserProfile {
    id: number;
    username: string;
    email?: string;
    full_name: string;
    bio_text: string;
    avatar: string | null;
    birth_date: string | null;
    city: string;
    date_joined: string;
    is_staff: boolean;
    posts_count: number;
    followers_count: number;
    following_count: number;
    is_following: boolean;
}

export interface PostAuthor {
    id: number;
    username: string;
    full_name: string;
    avatar: string | null;
    is_following?: boolean;
}

export interface PostImage {
    id: number;
    image: string;
    uploaded_at: string;
}

export interface PostStatistics {
    likes_count: number;
    saves_count: number;
    comments_count: number;
}

export type PostStatus = "pending" | "approved" | "rejected";

export interface Post {
    id: number;
    user: PostAuthor;
    /** null, пока пост не одобрен и позиция в каталоге ещё не создана. */
    menu_item: MenuItem | null;
    description: string;
    /** Необязательный размер: «0.4 л», «30 см». */
    size: string;
    author_rating: number;
    images: PostImage[];
    statistics: PostStatistics;
    tags: Array<{ id: number; name: string }>;
    created_at: string;
    status: PostStatus;
    rejection_reason: string;
    is_liked: boolean;
    is_saved: boolean;
    /** Одобренный пост не редактируется — только удаляется. */
    is_editable: boolean;
}

export interface Comment {
    id: number;
    post: number;
    user: number;
    user_detail: PostAuthor;
    text: string;
    created_at: string;
    likes_count: number;
    is_liked: boolean;
    is_editable: boolean;
}

/**
 * Подсказка заведения из нашего справочника.
 *
 * Главная защита от дублей: человек видит, что место уже заведено, и выбирает его.
 * Поэтому рядом с названием обязательно показываем адрес и число постов — рядом
 * с «Кофемания, Пушкина 10 · 24 поста» дубль с одним постом никто не выберет.
 */
export interface PlaceSuggestion {
    id: number;
    name: string;
    address: string;
    city: string;
    posts_count: number;
    contributors_count: number;
    is_confirmed: boolean;
}

/** Что появится в каталоге, если модератор одобрит пост. */
export interface ModerationPreview {
    restaurant: {
        id: number | null;
        name: string;
        address: string;
        city: string;
        /** Новое заведение — на него модератор смотрит внимательнее всего. */
        is_new: boolean;
        posts_count: number;
    };
    menu_item: {
        name: string;
        dish_type: string | null;
        taxons: Taxon[];
        price: string | null;
    };
}

export interface ModerationPost {
    id: number;
    user: PostAuthor;
    description: string;
    size: string;
    author_rating: number;
    images: PostImage[];
    tags: Array<{ id: number; name: string }>;
    created_at: string;
    status: PostStatus;
    menu_item: MenuItem | null;
    will_create: ModerationPreview | null;
    /** Похожие позиции в том же заведении — подсказка «может, это дубль?». */
    similar_menu_items: Array<{ id: number; name: string; similarity: number }>;
    /** Похожие заведения — ответ на попытку обойти подсказки. */
    similar_restaurants: Array<{
        id: number; name: string; address: string;
        posts_count: number; similarity: number;
    }>;
    price_change: { current: string | null; proposed: string } | null;
    /** Человекочитаемые причины пометок — модератору сразу текстом. */
    warnings: string[];
    possible_duplicate: boolean;
    looks_suspicious: boolean;
}

export interface ModerationStats {
    pending: number;
    new_items: number;
    price_changes: number;
    waiting_over_day: number;
    suspicious: number;
}

export interface Paginated<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

/** Ответ ручек лайка и сохранения. */
export interface ToggleState {
    active: boolean;
    count: number;
}
