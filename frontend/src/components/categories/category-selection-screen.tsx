"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, RotateCcw } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";

import { GlassSurface } from "@/components/feed/glass-surface";
import {
  FIELD_TINT_CLASSES,
  PRESS_CLASSES,
  ReviewContentLayer,
  ReviewScreen,
  ReviewScreenHeader,
  ReviewScrollArea,
  getReviewChromeStyle,
} from "@/components/review/review-screen-shell";
import { CategoryModeToggle } from "@/components/categories/category-mode-toggle";
import {
  getCuisineCategories,
  getDishCategories,
  getPlaceCategories,
  getPopularCuisineCategories,
  getPopularDishCategories,
  matchCategoryByName,
  type ApiCategory,
  type FoodCategory,
  type PlaceCategory,
} from "@/lib/categories";
import type { Palette } from "@/lib/mock-data";
import { getSearchResultsHref } from "@/lib/search";
import { cn } from "@/lib/utils";

type CategorySelectionSource = "review" | "search";

type CategoryTab = "dishes" | "cuisines" | "formats";

const MODE_ORDER: CategoryTab[] = ["dishes", "cuisines", "formats"];

const CATEGORY_TABS: readonly { id: CategoryTab; label: string }[] = [
  { id: "dishes", label: "Блюда" },
  { id: "cuisines", label: "Кухни" },
  { id: "formats", label: "Формат" },
];

const ALL_SECTION_TITLE: Record<CategoryTab, string> = {
  dishes: "Все блюда",
  cuisines: "Все кухни",
  formats: "Все форматы",
};

type CategorySelectionScreenProps = {
  brand: string;
  palette: Palette;
  source: CategorySelectionSource;
  /** Категории из бэка (server-side fetch). Если передан — клик по категории
   *  при source="search" использует числовой category_id вместо #label.
   */
  apiCategories?: ApiCategory[];
  onBack?: () => void;
  onSelectCategory?: (category: FoodCategory) => void;
};

type CategoryData = {
  dishes: FoodCategory[];
  cuisines: FoodCategory[];
  popularDishes: FoodCategory[];
  popularCuisines: FoodCategory[];
  // Форматы заведений (фастфуд, десерты, кофе…) — заглушка на фронте.
  placeCategories: PlaceCategory[];
};

type LoadState =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: CategoryData; error: null }
  | { status: "error"; data: null; error: string };

const POPULAR_SLIDE_DISTANCE = 42;

type PopularSlideCustom = {
  direction: number;
  shouldReduceMotion: boolean;
};

const popularSlideVariants: Variants = {
  initial: ({ direction, shouldReduceMotion }: PopularSlideCustom) => ({
    opacity: 0,
    x: shouldReduceMotion ? 0 : direction * POPULAR_SLIDE_DISTANCE,
  }),
  animate: {
    opacity: 1,
    x: 0,
  },
  exit: ({ direction, shouldReduceMotion }: PopularSlideCustom) => ({
    opacity: 0,
    x: shouldReduceMotion ? 0 : direction * -POPULAR_SLIDE_DISTANCE,
  }),
};

function canAnimate(shouldReduceMotion: boolean | null) {
  return !shouldReduceMotion;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <GlassSurface className="rounded-[22px] border border-white/62 bg-white/54 px-4 py-5 text-center shadow-[0_8px_24px_rgba(20,40,28,0.10),0_2px_6px_rgba(20,40,28,0.06)]">
      <p className="text-[18px] leading-tight font-semibold text-[#15291C]">
        {title}
      </p>
      <p className="mt-1 font-[family-name:var(--font-roboto)] text-[14px] leading-snug font-medium text-[#5C6B62]">
        {text}
      </p>
    </GlassSurface>
  );
}

function CategorySkeleton() {
  return (
    <div className="grid grid-cols-4 gap-x-4 gap-y-4 max-[380px]:gap-x-2.5">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="min-w-0">
          <div className="aspect-square rounded-[22px] bg-white/66 shadow-[0_8px_18px_rgba(20,40,28,0.07),inset_1px_1px_0_rgba(255,255,255,0.72)]" />
          <div className="mx-auto mt-1.5 h-3 w-12 rounded-full bg-white/66" />
        </div>
      ))}
    </div>
  );
}


function PopularCategoryGrid({
  categories,
  onSelect,
}: {
  categories: FoodCategory[];
  onSelect: (category: FoodCategory) => void;
}) {
  const shouldReduceMotion = useReducedMotion();

  if (categories.length === 0) {
    return (
      <EmptyState
        title="Популярных категорий пока нет"
        text="Справочник подключится здесь, когда backend вернет данные."
      />
    );
  }

  return (
    <div className="grid grid-cols-4 gap-x-4 gap-y-4 max-[380px]:gap-x-2.5">
      {categories.map((category) => (
        <motion.button
          key={category.id}
          type="button"
          onClick={() => onSelect(category)}
          className={cn(
            "group min-w-0 cursor-pointer rounded-[24px] text-center outline-none focus-visible:ring-2 focus-visible:ring-[#15291C]/18",
            PRESS_CLASSES
          )}
          whileTap={canAnimate(shouldReduceMotion) ? { scale: 0.94 } : undefined}
        >
          <span
            className="grid aspect-square w-full place-items-center rounded-[22px] bg-white text-[30px] shadow-[0_8px_20px_rgba(20,40,28,0.08),inset_0_0_0_1.5px_#2ECC71] transition-transform duration-200 group-hover:-translate-y-0.5 max-[380px]:text-[26px]"
          >
            <span aria-hidden="true">{category.emoji}</span>
          </span>
          <span
            className={cn(
              "mt-1.5 flex h-8 items-start justify-center overflow-hidden text-center leading-tight font-bold text-[#15291C]",
              category.mode === "cuisines"
                ? "text-[10.5px] max-[380px]:text-[9.5px]"
                : "text-[12px] max-[380px]:text-[10.5px]"
            )}
          >
            {category.label}
          </span>
        </motion.button>
      ))}
    </div>
  );
}

export function CategorySelectionScreen({
  brand,
  palette,
  source,
  apiCategories,
  onBack,
  onSelectCategory,
}: CategorySelectionScreenProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  // Режим сетки: Блюда / Кухни / Форматы. Переключатель показываем только в
  // поиске; в создании отзыва mode фиксирован на "dishes".
  const [mode, setMode] = useState<CategoryTab>("dishes");
  const [popularSlideDirection, setPopularSlideDirection] = useState(1);
  const [hasSwitchedPopularMode, setHasSwitchedPopularMode] = useState(false);

  function handleModeChange(next: CategoryTab) {
    if (next === mode) return;
    setPopularSlideDirection(
      MODE_ORDER.indexOf(next) > MODE_ORDER.indexOf(mode) ? 1 : -1
    );
    setHasSwitchedPopularMode(true);
    setMode(next);
  }
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    data: null,
    error: null,
  });

  async function loadCategories() {
    setLoadState({ status: "loading", data: null, error: null });

    try {
      const [dishes, cuisines, popularDishes, popularCuisines] =
        await Promise.all([
          getDishCategories(),
          getCuisineCategories(),
          getPopularDishCategories(),
          getPopularCuisineCategories(),
        ]);

      setLoadState({
        status: "success",
        data: {
          dishes,
          cuisines,
          popularDishes,
          popularCuisines,
          placeCategories: getPlaceCategories(),
        },
        error: null,
      });
    } catch {
      setLoadState({
        status: "error",
        data: null,
        error: "Не удалось загрузить категории. Попробуйте ещё раз.",
      });
    }
  }

  useEffect(() => {
    let isActive = true;

    async function load() {
      setLoadState({ status: "loading", data: null, error: null });

      try {
        // NR1: если бэк отдал реальные категории — показываем их (мапим
        // на FoodCategory через matchCategoryByName, чтобы получить эмодзи).
        // Иначе fallback на статические DISH_/CUISINE_CATEGORIES.
        const useApi = apiCategories && apiCategories.length > 0;

        const dishesFromApi: FoodCategory[] = useApi
          ? apiCategories!.map((c): FoodCategory => {
              const matched = matchCategoryByName(c.name);
              return (
                matched ?? {
                  id: `api-${c.id}`,
                  label: c.name,
                  emoji: c.icon || "🍽️",
                  mode: "dishes",
                }
              );
            })
          : await getDishCategories();

        // Кухни — всегда из статического справочника (заглушка), даже если
        // блюда пришли с бэка: справочника кухонь на беке пока нет.
        const cuisines = await getCuisineCategories();
        const popularDishes = useApi
          ? dishesFromApi.slice(0, 4)
          : await getPopularDishCategories();
        const popularCuisines = useApi ? [] : await getPopularCuisineCategories();

        if (!isActive) return;

        setLoadState({
          status: "success",
          data: {
            dishes: dishesFromApi,
            cuisines,
            popularDishes,
            popularCuisines,
            placeCategories: getPlaceCategories(),
          },
          error: null,
        });
      } catch {
        if (!isActive) return;

        setLoadState({
          status: "error",
          data: null,
          error: "Не удалось загрузить категории. Попробуйте ещё раз.",
        });
      }
    }

    load();

    return () => {
      isActive = false;
    };
  }, [apiCategories]);

  const currentCategories = useMemo(() => {
    if (loadState.status !== "success") return [];
    if (mode === "dishes") return loadState.data.dishes;
    if (mode === "cuisines") return loadState.data.cuisines;
    // Форматы: PlaceCategory → FoodCategory (mode влияет только на размер подписи).
    return loadState.data.placeCategories.map(
      (category): FoodCategory => ({ ...category, mode: "dishes" })
    );
  }, [loadState, mode]);

  const currentPopularCategories = useMemo(() => {
    if (loadState.status !== "success") return [];
    if (mode === "dishes") return loadState.data.popularDishes;
    if (mode === "cuisines") return loadState.data.popularCuisines;
    // У форматов «популярных» нет — секцию не показываем.
    return [];
  }, [loadState, mode]);

  function handleBack() {
    if (onBack) {
      onBack();
      return;
    }

    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(source === "search" ? "/search" : "/new-review");
  }

  function handleSelectCategory(category: FoodCategory) {
    if (onSelectCategory) {
      onSelectCategory(category);
      return;
    }

    if (source === "search") {
      // NR2: если есть данные из бэка — используем числовой category_id
      if (apiCategories && apiCategories.length > 0) {
        const apiCat = apiCategories.find(
          (c) => c.name.toLowerCase() === category.label.toLowerCase()
        );
        if (apiCat) {
          router.push(`/search/results?category_id=${apiCat.id}`);
          return;
        }
      }
      // Fallback: текстовый поиск по label если бэк не отдал категорию
      router.push(getSearchResultsHref(category.label));
      return;
    }

    router.push("/new-review");
  }

  return (
    <ReviewScreen palette={palette}>
      <ReviewContentLayer>
        <ReviewScrollArea aria-label="Выбор категории">
          <ReviewScreenHeader
            title="Выберите категорию"
            onBack={handleBack}
          />

          {source === "search" && (
            <div className="mb-6">
              <CategoryModeToggle
                aria-label="Тип категории"
                items={CATEGORY_TABS}
                value={mode}
                onValueChange={handleModeChange}
              />
            </div>
          )}

          <div className="space-y-7">
            {(loadState.status !== "success" ||
              currentPopularCategories.length > 0) && (
            <section>
              <h2 className="mb-3 text-[22px] leading-tight font-semibold tracking-[0px] text-[#15291C] max-[380px]:text-[20px]">
                Популярные категории
              </h2>
              <div className="overflow-hidden">
                <AnimatePresence
                  mode="wait"
                  custom={{
                    direction: popularSlideDirection,
                    shouldReduceMotion: !!shouldReduceMotion,
                  }}
                >
                  {loadState.status === "loading" ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <CategorySkeleton />
                    </motion.div>
                  ) : loadState.status === "error" ? (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                    >
                      <GlassSurface
                        className="rounded-[22px] border border-transparent bg-white px-4 py-4"
                        tintClassName={FIELD_TINT_CLASSES}
                        style={getReviewChromeStyle(
                          brand,
                          "rgba(255,255,255,0.82)"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
                            <CircleAlert className="size-4" strokeWidth={2.35} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[16px] leading-tight font-bold text-[#15291C]">
                              Категории не загрузились
                            </p>
                            <p className="mt-1 font-[family-name:var(--font-roboto)] text-[14px] leading-snug font-medium text-[#5C6B62]">
                              {loadState.error}
                            </p>
                            <button
                              type="button"
                              onClick={loadCategories}
                              className={cn(
                                "mt-3 inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-transparent bg-white px-3 text-[13px] font-bold text-[#15291C] outline-none focus-visible:ring-2 focus-visible:ring-[#15291C]/18",
                                PRESS_CLASSES
                              )}
                              style={getReviewChromeStyle(brand)}
                            >
                              <RotateCcw className="size-3.5" strokeWidth={2.4} />
                              Обновить
                            </button>
                          </div>
                        </div>
                      </GlassSurface>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={`popular-${mode}`}
                      custom={{
                        direction: popularSlideDirection,
                        shouldReduceMotion: !!shouldReduceMotion,
                      }}
                      variants={popularSlideVariants}
                      initial={hasSwitchedPopularMode ? "initial" : false}
                      animate="animate"
                      exit={hasSwitchedPopularMode ? "exit" : undefined}
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : { duration: 0.24, ease: [0.32, 0.72, 0, 1] }
                      }
                    >
                      <PopularCategoryGrid
                        categories={currentPopularCategories}
                        onSelect={handleSelectCategory}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>
            )}

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[22px] leading-tight font-semibold tracking-[0px] text-[#15291C] max-[380px]:text-[20px]">
                  {ALL_SECTION_TITLE[mode]}
                </h2>
              </div>

              {loadState.status === "success" ? (
                <PopularCategoryGrid
                  categories={currentCategories}
                  onSelect={handleSelectCategory}
                />
              ) : loadState.status === "loading" ? (
                <CategorySkeleton />
              ) : (
                <EmptyState
                  title="Нет данных"
                  text="Список появится после успешной загрузки справочника."
                />
              )}
            </section>
          </div>
        </ReviewScrollArea>
      </ReviewContentLayer>
    </ReviewScreen>
  );
}
