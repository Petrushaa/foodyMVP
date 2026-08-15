import { apiRequest, fixMediaUrl } from "@/lib/api";

export type CategoryMode = "dishes" | "cuisines" | "formats" | "forms" | "diets";

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

/** Категория заведения (тип точки: фастфуд, кафе и т.п.). */
export type PlaceCategory = {
  id: string;
  label: string;
  emoji: string;
};

// Заглушка на фронте. TODO: заменить на справочник категорий заведений с бэка.
const PLACE_CATEGORIES: PlaceCategory[] = [
  { id: "fastfood", label: "Фастфуд", emoji: "🍟" },
  { id: "cafe", label: "Кафе", emoji: "☕" },
  { id: "restaurant", label: "Ресторан", emoji: "🍽️" },
  { id: "coffee", label: "Кофейня", emoji: "🥐" },
  { id: "bakery", label: "Пекарня", emoji: "🥖" },
  { id: "bar", label: "Бар", emoji: "🍺" },
  { id: "pizzeria", label: "Пиццерия", emoji: "🍕" },
  { id: "sushi-bar", label: "Суши-бар", emoji: "🍣" },
  { id: "canteen", label: "Столовая", emoji: "🥘" },
  { id: "street-food", label: "Стритфуд", emoji: "🌭" },
  { id: "dessert", label: "Десерты", emoji: "🍰" },
  { id: "pub", label: "Паб", emoji: "🍻" },
];

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

/** Формат еды: фастфуд, стритфуд, кофейня и так далее. Ось «format» на бэкенде. */
export async function getFormatCategories(): Promise<FoodCategory[]> {
  const loaded = await loadTaxons("format", "formats");
  if (loaded) return loaded;
  return PLACE_CATEGORIES.map((c) => ({
    id: c.id, label: c.label, emoji: c.emoji, mode: "formats" as const,
  }));
}

/** Форма еды: супы, салаты, десерты, выпечка. Ось «form» на бэкенде. */
export async function getFormCategories(): Promise<FoodCategory[]> {
  return (await loadTaxons("form", "forms")) ?? [];
}

/** Дополнительные признаки: вегетарианское, постное, ПП. Ось «diet». */
export async function getDietCategories(): Promise<FoodCategory[]> {
  return (await loadTaxons("diet", "diets")) ?? [];
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

export function getPlaceCategories(): PlaceCategory[] {
  return PLACE_CATEGORIES.map((category) => ({ ...category }));
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

// ── Авто-распознавание категории блюда по названию (способы 1+2) ──────────────
// 1) сопоставление по ключевым словам/синонимам (подстрока в нормализованном
//    названии); 2) fuzzy — терпимость к опечаткам (расстояние Левенштейна).
// Ключи хранятся уже нормализованными: нижний регистр, ё→е, без дефисов.
const DISH_CATEGORY_KEYWORDS: Record<string, string[]> = {
  pizza: ["пицц"],
  burgers: ["бургер"],
  sandwiches: ["сэндвич", "сендвич", "сандвич", "панини", "чиабатт"],
  shawarma: ["шаурм", "шаверм", "шаварм", "донер", "дюрюм"],
  "sushi-rolls": [
    "суши",
    "ролл",
    "филадельфия",
    "калифорни",
    "нигири",
    "сашими",
    "урамаки",
    "темаки",
  ],
  ramen: ["рамен", "рамэн"],
  wok: ["вок", "удон", "якисоба", "фунчоза"],
  pasta: [
    "паста",
    "спагетти",
    "карбонара",
    "болонье",
    "феттучини",
    "лазань",
    "пенне",
    "тальятелле",
    "равиоли",
    "ньокки",
  ],
  tacos: ["тако", "буррито", "кесадиль", "начос", "энчилада", "фахитас"],
  "tom-yum": ["том ям", "томям"],
  poke: ["поке"],
  khachapuri: ["хачапур"],
  steaks: ["стейк", "рибай", "стриплойн", "миньон", "антрекот", "томагавк"],
  cheesecake: ["чизкейк"],
};

function normalizeDishText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9 ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Определяет категорию блюда по названию. Сначала — точные вхождения ключевых
 * слов (например «грибная шаурма» → Шаурма), затем — fuzzy по опечаткам
 * («шаверама», «пицаа»). Если ничего не подошло — возвращает null (юзер выберет
 * сам). Ищет только среди DISH_CATEGORIES.
 */
export function detectDishCategory(name: string): FoodCategory | null {
  const norm = normalizeDishText(name);
  if (norm.length < 2) return null;
  const tokens = norm.split(" ").filter(Boolean);

  let bestId: string | null = null;
  let bestScore = -Infinity;

  // 1) Подстрока — надёжнее, поэтому даём высокий приоритет (score + 100).
  for (const cat of DISH_CATEGORIES) {
    for (const kw of DISH_CATEGORY_KEYWORDS[cat.id] ?? []) {
      if (norm.includes(kw)) {
        const score = kw.length + 100;
        if (score > bestScore) {
          bestScore = score;
          bestId = cat.id;
        }
      }
    }
  }

  // 2) Fuzzy по одиночным словам ≥4 символов (только если подстрока не нашлась).
  if (bestId === null) {
    for (const cat of DISH_CATEGORIES) {
      for (const kw of DISH_CATEGORY_KEYWORDS[cat.id] ?? []) {
        if (kw.includes(" ") || kw.length < 4) continue;
        const maxDist = kw.length <= 6 ? 1 : 2;
        for (const tok of tokens) {
          if (tok.length < 3 || Math.abs(tok.length - kw.length) > maxDist) {
            continue;
          }
          const dist = levenshtein(tok, kw);
          if (dist <= maxDist) {
            const score = kw.length - dist;
            if (score > bestScore) {
              bestScore = score;
              bestId = cat.id;
            }
          }
        }
      }
    }
  }

  if (bestId === null) return null;
  return DISH_CATEGORIES.find((c) => c.id === bestId) ?? null;
}
