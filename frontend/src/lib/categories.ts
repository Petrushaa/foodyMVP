import { apiRequest, fixMediaUrl } from "@/lib/api";

// Оси справочника. Формат, форма и особенности слиты в один «вид»: делить
// «фастфуд», «бургеры» и «веганское» по трём вкладкам значило бы заставлять
// человека угадывать, в какой из них лежит нужное.
export type CategoryMode = "dishes" | "cuisines" | "types";

export type FoodCategory = {
  id: string;
  label: string;
  emoji: string;
  /** URL картинки из справочника. Пусто — рисуется эмодзи. */
  icon?: string;
  mode: CategoryMode;
};

const DISH_CATEGORIES: FoodCategory[] = [
  { id: "pizza", label: "Пицца", emoji: "🍕", mode: "dishes" },
  { id: "burgers", label: "Бургеры", emoji: "🍔", mode: "dishes" },
  { id: "sandwiches", label: "Сэндвичи", emoji: "🥪", mode: "dishes" },
  { id: "shawarma", label: "Шаурма", emoji: "🌯", mode: "dishes" },
  { id: "sushi-rolls", label: "Суши и роллы", emoji: "🍣", mode: "dishes" },
  { id: "ramen", label: "Рамен", emoji: "🍜", mode: "dishes" },
  { id: "wok", label: "Вок", emoji: "🥞", mode: "dishes" },
  { id: "pasta", label: "Паста", emoji: "🍝", mode: "dishes" },
  { id: "tacos", label: "Тако", emoji: "🌮", mode: "dishes" },
  { id: "tom-yum", label: "Том-ям", emoji: "🥣", mode: "dishes" },
  { id: "poke", label: "Поке", emoji: "🍚", mode: "dishes" },
  { id: "khachapuri", label: "Хачапури", emoji: "🫓", mode: "dishes" },
  { id: "steaks", label: "Стейки", emoji: "🥩", mode: "dishes" },
  { id: "cheesecake", label: "Чизкейк", emoji: "🍰", mode: "dishes" },
];

const CUISINE_CATEGORIES: FoodCategory[] = [
  { id: "asian", label: "Азиатская", emoji: "🥢", mode: "cuisines" },
  { id: "italian", label: "Итальянская", emoji: "🍝", mode: "cuisines" },
  { id: "russian", label: "Русская", emoji: "🥟", mode: "cuisines" },
  { id: "caucasian", label: "Кавказская", emoji: "🫓", mode: "cuisines" },
  { id: "american", label: "Американская", emoji: "🍔", mode: "cuisines" },
  { id: "middle-eastern", label: "Ближневосточная", emoji: "🧆", mode: "cuisines" },
  { id: "mexican", label: "Мексиканская", emoji: "🌮", mode: "cuisines" },
  { id: "french", label: "Французская", emoji: "🥐", mode: "cuisines" },
  { id: "georgian", label: "Грузинская", emoji: "🥟", mode: "cuisines" },
  { id: "japanese", label: "Японская", emoji: "🍣", mode: "cuisines" },
  { id: "korean", label: "Корейская", emoji: "🥘", mode: "cuisines" },
  { id: "thai", label: "Тайская", emoji: "🌶️", mode: "cuisines" },
];

const POPULAR_DISH_CATEGORY_IDS = [
  "pizza",
  "burgers",
  "sandwiches",
  "shawarma",
  "sushi-rolls",
  "ramen",
  "wok",
  "pasta",
];

const POPULAR_CUISINE_CATEGORY_IDS = [
  "asian",
  "italian",
  "russian",
  "caucasian",
  "american",
  "georgian",
  "mexican",
  "french",
];

function cloneCategories(categories: FoodCategory[]) {
  return categories.map((category) => ({ ...category }));
}

function pickCategoriesById(categories: FoodCategory[], ids: string[]) {
  const byId = new Map(categories.map((category) => [category.id, category]));

  return ids.flatMap((id) => {
    const category = byId.get(id);

    return category ? [{ ...category }] : [];
  });
}

/**
 * Справочники приходят с бэкенда: там 125 блюд и 58 категорий по четырём осям,
 * и там же у каждой записи лежит иконка — её выбирает админ, а не разработчик.
 *
 * Локальные списки остались запасным вариантом: если бэкенд недоступен,
 * экран не должен оказаться пустым.
 */

type ApiDishType = { id: number; name: string; emoji?: string; icon?: string | null };
type ApiTaxon = {
  id: number;
  kind: string;
  name: string;
  slug: string;
  emoji?: string;
  icon?: string | null;
};

async function loadDishTypes(): Promise<FoodCategory[] | null> {
  try {
    const data = await apiRequest("/dish-types/");
    const list: ApiDishType[] = Array.isArray(data) ? data : (data?.results ?? []);
    if (!list.length) return null;
    // id — это название: форма создания поста отправляет его как есть,
    // а сопоставить со своим справочником бэкенд умеет сам.
    return list.map((item) => ({
      id: item.name,
      label: item.name,
      emoji: item.emoji || "🍽️",
      icon: fixMediaUrl(item.icon) || undefined,
      mode: "dishes" as const,
    }));
  } catch {
    return null;
  }
}

async function loadTaxons(kind: string, mode: CategoryMode): Promise<FoodCategory[] | null> {
  try {
    const data = await apiRequest(`/taxons/?kind=${kind}`);
    const list: ApiTaxon[] = Array.isArray(data) ? data : (data?.results ?? []);
    if (!list.length) return null;
    return list.map((item) => ({
      id: item.slug,
      label: item.name,
      emoji: item.emoji || "🍽️",
      icon: fixMediaUrl(item.icon) || undefined,
      mode,
    }));
  } catch {
    return null;
  }
}

export async function getDishCategories() {
  return (await loadDishTypes()) ?? cloneCategories(DISH_CATEGORIES);
}

export async function getCuisineCategories() {
  return (await loadTaxons("cuisine", "cuisines")) ?? cloneCategories(CUISINE_CATEGORIES);
}

/**
 * Виды еды: фастфуд, бургеры, веганское, десерты — всё в одной оси.
 *
 * У позиции их может быть несколько сразу (веганский фастфуд), поэтому в
 * интерфейсе это единственная вкладка с множественным выбором.
 */
export async function getTypeCategories(): Promise<FoodCategory[]> {
  // Не ответил справочник — отдаём пусто, а не запасной список.
  //
  // Запасным тут стояли категории заведений: «Фастфуд, Кафе, Ресторан,
  // Кофейня». Виду еды из них соответствует только первая, а по остальным
  // фильтр уходил на бэкенд слагами, которых в справочнике нет, и молча
  // возвращал пустую выдачу. Отсутствие кнопок честнее кнопок, ведущих в
  // никуда.
  return (await loadTaxons("type", "types")) ?? [];
}

/**
 * Популярные — просто первые из справочника: он отсортирован по названию,
 * а осмысленной популярности у категорий пока нет.
 */
export async function getPopularDishCategories() {
  const all = await getDishCategories();
  return all.length > 14 ? all.slice(0, 14) : all;
}

export async function getPopularCuisineCategories() {
  const all = await getCuisineCategories();
  return all.length > 12 ? all.slice(0, 12) : all;
}

/**
 * Match a Django category name (e.g. "Пицца") to a FoodCategory entry.
 * Used to enrich backend category data with emoji/icon metadata.
 */
export function matchCategoryByName(name: string): FoodCategory | null {
  const normalized = name.trim().toLowerCase();
  const all = [...DISH_CATEGORIES, ...CUISINE_CATEGORIES];
  return all.find((c) => c.label.toLowerCase() === normalized) ?? null;
}

export type ApiCategory = {
  id: number;
  name: string;
  icon: string;
  color: string;
};

/**
 * Загрузить категории с бэка и обогатить их emoji из локальной карты.
 *
 * Плоских категорий больше нет: вместо них четыре оси (кухня, формат, форма,
 * дополнительно) в /taxons/. Берём их все — эмодзи и режим по-прежнему
 * подтягиваются из локального списка по названию.
 *
 * Если бэк недоступен — возвращаем пустой массив, интерфейс покажет свой список.
 */
export async function fetchCategories(accessToken?: string): Promise<ApiCategory[]> {
  try {
    const options: RequestInit = accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : {};
    const data = await apiRequest("/taxons/", options);
    const rawList: { id: number; name: string }[] = Array.isArray(data)
      ? data
      : (data?.results ?? []);

    return rawList.map((cat) => {
      const matched = matchCategoryByName(cat.name);
      return {
        id: cat.id,
        name: cat.name,
        icon: matched?.emoji ?? "🍽️",
        color: matched ? "#2ECC71" : "#888888",
      };
    });
  } catch {
    // Если бэк не отдал категории — возвращаем пустой массив, UI покажет заглушку
    return [];
  }
}

/**
 * Загрузить топ-N популярных тегов с бэка (/api/v1/tags/ уже отсортирован по -usage_count).
 * Используется на странице поиска для блока "Популярные теги".
 */
export async function fetchPopularTags(accessToken?: string, limit = 12): Promise<string[]> {
  try {
    const options: RequestInit = accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : {};
    const data = await apiRequest(`/tags/?ordering=-usage_count`, options);
    const rawList: { id: number; name: string; usage_count?: number }[] = Array.isArray(data)
      ? data
      : (data?.results ?? []);

    return rawList
      .filter((t) => t.name)
      .slice(0, limit)
      .map((t) => t.name);
  } catch {
    return [];
  }
}
