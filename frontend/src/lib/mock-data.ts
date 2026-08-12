export type Post = {
  id: number;
  user: string;
  realName: string;
  when: string;
  dish: string;
  place: string;
  rating: number;
  price: string;
  text: string;
  tags: string[];
  photos: number;
  likes: number;
  comments: number;
  seed: number;
  // Опциональные поля для реальных данных из API (адаптер foody-front ↔ Django).
  photoUrls?: string[];
  avatarUrl?: string;
  userId?: number;
  restaurantId?: number;
  /** Позиция — блюдо в заведении. Ссылка на её страницу и источник цены. */
  menuItemId?: number;
};

export type PostComment = {
  id: number | string;
  user: string;
  realName: string;
  avatarUrl?: string;
  when: string;
  text: string;
  likes: number;
  liked?: boolean;
  replyTo?: string;
  replyToCommentId?: PostComment["id"];
  clientId?: string;
  status?: "sending" | "sent" | "failed";
};

export type Palette = "fresh" | "citrus" | "dusk";
export type Density = "comfortable" | "cozy";

export type Tweaks = {
  brand: string;
  palette: Palette;
  density: Density;
};

export const DEFAULT_TWEAKS: Tweaks = {
  brand: "#2ECC71",
  palette: "fresh",
  density: "comfortable",
};

// POSTS удалён — мёртвый мок (моки удалены в массфикс-волне).
// POPULAR_TAGS удалён — хардкод убран (SO3).
// TODO: получать популярные теги из /api/v1/tags/popular/ когда бэк добавит этот эндпоинт (G1).
// COMMENTS_BY_POST_ID удалён — мёртвый мок.
// RECENT_SEARCHES удалён — мёртвый мок.
