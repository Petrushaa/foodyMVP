"use client";

import {
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  CircleAlert,
  ImageUp,
  Pencil,
  Plus,
  Star,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { PhotoCropModal } from "@/components/review/photo-crop-modal";

import { CategorySelectionScreen } from "@/components/categories/category-selection-screen";
import { GlassSurface } from "@/components/feed/glass-surface";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { detectDishCategory, type FoodCategory } from "@/lib/categories";
import type { Palette } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import {
  FIELD_INPUT_CLASSES,
  FIELD_SURFACE_CLASSES,
  FIELD_TINT_CLASSES,
  PRESS_CLASSES,
  ReviewContentLayer,
  ReviewScreen,
  ReviewScreenHeader,
  ReviewScrollArea,
  getReviewChromeStyle,
} from "@/components/review/review-screen-shell";
import { createPost } from "@/app/actions/post";

const MAX_REVIEW_LENGTH = 2000;
const MAX_TAGS = 3;
const MAX_PHOTOS = 10;
const REQUIRED_ALERT_MS = 2200;
const STAR_YELLOW = "#FFB400";

type NewReviewFormProps = {
  brand: string;
  palette: Palette;
};

type ReviewFieldProps = {
  brand: string;
  label: string;
  placeholder: string;
  value: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  onChange: (value: string) => void;
};

function canAnimate(shouldReduceMotion: boolean | null) {
  return !shouldReduceMotion;
}

function ReviewField({
  brand,
  label,
  placeholder,
  value,
  inputMode,
  maxLength,
  onChange,
}: ReviewFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-[22px] leading-tight font-semibold tracking-[0px] text-[#15291C] max-[380px]:text-[20px]">
        {label}
      </span>
      <GlassSurface
        className={FIELD_SURFACE_CLASSES}
        contentClassName="h-full"
        tintClassName={FIELD_TINT_CLASSES}
        highlightClassName="after:border-[0.5px] after:border-white/58 after:shadow-[inset_1px_1px_0_rgba(255,255,255,0.74),inset_-1px_-1px_0_rgba(255,255,255,0.26)]"
        style={getReviewChromeStyle(brand)}
      >
        <div className="group flex h-full items-center gap-2 pr-3">
          <Input
            value={value}
            inputMode={inputMode}
            maxLength={maxLength}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className={cn(FIELD_INPUT_CLASSES, "min-w-0 flex-1 pr-0")}
          />
          {value && (
            <button
              type="button"
              aria-label="Очистить"
              onClick={() => onChange("")}
              className={cn(
                "grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[rgba(20,40,28,0.08)] p-0 text-[#3A4A40] opacity-0 transition-opacity group-focus-within:opacity-100",
                PRESS_CLASSES
              )}
            >
              <X className="size-[11px]" strokeWidth={2.4} />
            </button>
          )}
        </div>
      </GlassSurface>
    </label>
  );
}

function RatingStar({
  index,
  rating,
  shouldReduceMotion,
  onRate,
}: {
  index: number;
  rating: number;
  shouldReduceMotion: boolean | null;
  onRate: (rating: number) => void;
}) {
  const fill = Math.max(0, Math.min(1, rating - index));

  function updateRating(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const nextHalf = pointerX <= rect.width / 2 ? 0.5 : 1;

    onRate(index + nextHalf);
  }

  return (
    <motion.button
      type="button"
      aria-label={`Оценка ${index + 1}`}
      className="relative grid size-12 cursor-pointer place-items-center rounded-[15px] border border-white/62 bg-white/42 text-[#AAB4AE] shadow-[0_8px_18px_rgba(20,40,28,0.08),inset_1px_1px_0_rgba(255,255,255,0.78)] outline-none backdrop-blur-[14px] focus-visible:ring-2 focus-visible:ring-[#15291C]/18 max-[380px]:size-10"
      onPointerDown={updateRating}
      whileTap={canAnimate(shouldReduceMotion) ? { scale: 0.86, rotate: -3 } : undefined}
    >
      <Star
        className="size-7 max-[380px]:size-6"
        strokeWidth={2.1}
        color={fill > 0 ? STAR_YELLOW : "#AAB4AE"}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden rounded-[15px]"
        style={{ clipPath: `inset(0 ${100 - fill * 100}% 0 0)` }}
      >
        <Star
          className="size-7 max-[380px]:size-6"
          strokeWidth={2.1}
          color={STAR_YELLOW}
          fill={STAR_YELLOW}
        />
      </span>
    </motion.button>
  );
}

function RatingControl({
  rating,
  shouldReduceMotion,
  onRate,
}: {
  rating: number;
  shouldReduceMotion: boolean | null;
  onRate: (rating: number) => void;
}) {
  return (
    <section className="pt-1">
      <div className="mb-3 grid grid-cols-[3.25rem_1fr_3.25rem] items-center gap-2">
        <span aria-hidden="true" />
        <h2 className="text-center text-[22px] leading-tight font-semibold text-[#15291C]">
          Оценка
        </h2>
        <span className="flex items-center justify-end gap-0.5 text-[18px] leading-none font-extrabold text-[#15291C]">
          <Star
            className="size-4"
            strokeWidth={2.1}
            color={STAR_YELLOW}
            fill={STAR_YELLOW}
            aria-hidden="true"
          />
          <span>{rating.toFixed(1)}</span>
        </span>
      </div>
      <div className="flex items-center justify-center gap-3 max-[380px]:gap-2.5">
        {[0, 1, 2, 3, 4].map((index) => (
          <RatingStar
            key={index}
            index={index}
            rating={rating}
            shouldReduceMotion={shouldReduceMotion}
            onRate={onRate}
          />
        ))}
      </div>
    </section>
  );
}

// Стабильные id и object-URL для файлов — чтобы при переносе (реордере) не
// пересоздавать превью (иначе мигает и ломается анимация layout).
function usePhotoItems(files: File[]) {
  const idMapRef = useRef(new WeakMap<File, string>());
  const counterRef = useRef(0);
  const urlMapRef = useRef(new Map<string, string>());

  const idFor = useCallback((file: File) => {
    let id = idMapRef.current.get(file);
    if (!id) {
      id = `p${counterRef.current++}`;
      idMapRef.current.set(file, id);
    }
    return id;
  }, []);

  const items = useMemo(
    () =>
      files.map((file) => {
        const id = idFor(file);
        let url = urlMapRef.current.get(id);
        if (!url) {
          url = URL.createObjectURL(file);
          urlMapRef.current.set(id, url);
        }
        return { id, url, name: file.name, file };
      }),
    [files, idFor]
  );

  // Чистим URL'ы удалённых файлов.
  useEffect(() => {
    const alive = new Set(items.map((it) => it.id));
    for (const [id, url] of urlMapRef.current) {
      if (!alive.has(id)) {
        URL.revokeObjectURL(url);
        urlMapRef.current.delete(id);
      }
    }
  }, [items]);

  useEffect(() => {
    const urls = urlMapRef.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  return items;
}

function PhotoUpload({
  files,
  onFilesChange,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const items = usePhotoItems(files);

  const [isDropActive, setIsDropActive] = useState(false);
  const [cropIndex, setCropIndex] = useState<number | null>(null);

  function addFiles(incoming: File[]) {
    const images = incoming.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    onFilesChange([...files, ...images].slice(0, MAX_PHOTOS));
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function removePhoto(indexToRemove: number) {
    onFilesChange(files.filter((_, index) => index !== indexToRemove));
  }

  // Перенос файлов с рабочего стола (нативный drag&drop файлов в браузер).
  function handleDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDropActive(false);
    const dropped = Array.from(event.dataTransfer.files ?? []);
    if (dropped.length > 0) addFiles(dropped);
  }
  function handleDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (Array.from(event.dataTransfer.types).includes("Files")) {
      event.preventDefault();
      setIsDropActive(true);
    }
  }
  function handleDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    // Уходим только если курсор покинул сам контейнер (не дочерний элемент).
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDropActive(false);
    }
  }

  // Реордер плиток (мышь+тач, Pointer Events) с живой перестановкой и
  // анимацией через motion layout. Целевой индекс считаем по ГЕОМЕТРИИ сетки
  // (а не elementFromPoint) — иначе анимирующиеся плитки ломают хит-тест и
  // перенос дёргается/не срабатывает. dragIndexRef = текущий индекс тащимой.
  const gridRef = useRef<HTMLDivElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>, index: number) {
    dragIndexRef.current = index;
    setDragIndex(index);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const from = dragIndexRef.current;
    const grid = gridRef.current;
    if (from === null || !grid) return;

    const COLS = 3;
    const GAP = 8; // gap-2
    const TILE_H = 122; // высота плитки
    const rect = grid.getBoundingClientRect();
    const cellW = (rect.width - GAP * (COLS - 1)) / COLS;

    let col = Math.floor((event.clientX - rect.left) / (cellW + GAP));
    let row = Math.floor((event.clientY - rect.top) / (TILE_H + GAP));
    col = Math.min(Math.max(col, 0), COLS - 1);
    row = Math.max(row, 0);

    const to = Math.min(row * COLS + col, files.length - 1);
    if (to < 0 || to === from) return;

    const next = files.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    dragIndexRef.current = to;
    setDragIndex(to);
    onFilesChange(next);
  }

  function endDrag() {
    dragIndexRef.current = null;
    setDragIndex(null);
  }

  return (
    <section>
      <h2 className="text-[22px] leading-tight font-semibold tracking-[0px] text-[#15291C] max-[380px]:text-[20px]">
        Фотография блюда
      </h2>
      <p className="mt-1 mb-2 font-[family-name:var(--font-roboto)] text-[13px] leading-snug font-medium text-[#5C6B62]">
        Мин. 1 фото. Перетаскивайте, чтобы менять порядок — первое станет главным. Карандаш — обрезать фото.
      </p>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "rounded-[28px] transition-colors",
          isDropActive &&
            "bg-[rgba(46,204,113,0.10)] outline-2 outline-dashed outline-[#2ECC71] outline-offset-4"
        )}
      >
        {items.length === 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex min-h-[122px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[26px] border-[1.5px] border-[#2ECC71] bg-white px-5 text-center text-[#15291C]",
              "outline-none focus-visible:ring-2 focus-visible:ring-[#15291C]/18",
              PRESS_CLASSES
            )}
          >
            <ImageUp className="size-9" strokeWidth={2.15} />
            <span className="font-[family-name:var(--font-roboto)] text-[14px] font-medium text-[#5C6B62]">
              {isDropActive
                ? "Отпустите — загрузим"
                : "Выберите фото или перетащите сюда"}
            </span>
          </button>
        ) : (
          <div ref={gridRef} className="grid grid-cols-3 gap-2">
            {items.map((item, index) => (
              <motion.div
                key={item.id}
                layout
                transition={{ type: "spring", stiffness: 700, damping: 48, mass: 0.6 }}
                data-photo-idx={index}
                onPointerDown={(event) => beginDrag(event, index)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{ zIndex: dragIndex === index ? 2 : 1 }}
                className={cn(
                  "relative h-[122px] w-full cursor-grab touch-none overflow-hidden rounded-[26px] border border-[rgba(20,40,28,0.08)] select-none active:cursor-grabbing",
                  index === 0 && "border-transparent ring-2 ring-[#2ECC71]",
                  dragIndex === index &&
                    "shadow-[0_10px_24px_rgba(20,40,28,0.26)] ring-2 ring-[#15291C]/35"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.name}
                  draggable={false}
                  className="pointer-events-none h-full w-full object-cover select-none"
                />
                {index === 0 && (
                  <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-[#2ECC71] px-2 py-[3px] text-[10.5px] font-extrabold text-white shadow-[0_2px_8px_rgba(20,40,28,0.28)]">
                    Главное
                  </span>
                )}
                <div className="absolute top-1.5 right-1.5 flex gap-1">
                  <button
                    type="button"
                    aria-label={`Обрезать фото ${index + 1}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => setCropIndex(index)}
                    className="grid size-6 cursor-pointer place-items-center rounded-full border-0 bg-black/45 text-white outline-none backdrop-blur-[2px]"
                  >
                    <Pencil className="size-3" strokeWidth={2.6} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Удалить фото ${index + 1}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => removePhoto(index)}
                    className="grid size-6 cursor-pointer place-items-center rounded-full border-0 bg-black/45 text-white outline-none backdrop-blur-[2px]"
                  >
                    <X className="size-3.5" strokeWidth={2.6} />
                  </button>
                </div>
              </motion.div>
            ))}
            {files.length < MAX_PHOTOS && (
              <button
                type="button"
                aria-label="Добавить фото"
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "grid h-[122px] w-full cursor-pointer place-items-center rounded-[26px] border-[1.5px] border-[#2ECC71] bg-white text-[#15291C]",
                  "outline-none focus-visible:ring-2 focus-visible:ring-[#15291C]/18",
                  PRESS_CLASSES
                )}
              >
                <Plus className="size-8" strokeWidth={2.25} />
              </button>
            )}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleChange}
        className="sr-only"
      />

      {cropIndex !== null && files[cropIndex] && (
        <PhotoCropModal
          file={files[cropIndex]}
          onCancel={() => setCropIndex(null)}
          onApply={(cropped) => {
            const next = files.slice();
            next[cropIndex] = cropped;
            onFilesChange(next);
            setCropIndex(null);
          }}
        />
      )}
    </section>
  );
}

function CategoryButton({
  category,
  onClick,
}: {
  category: FoodCategory | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[52px] w-full cursor-pointer items-center gap-3 rounded-[18px] border border-[rgba(20,40,28,0.08)] bg-white/70 px-4 text-left text-[#15291C] shadow-[0_4px_14px_rgba(20,40,28,0.06)]",
        PRESS_CLASSES
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-[10px] bg-white text-[17px] leading-none"
        style={{
          boxShadow: "0 4px 10px rgba(20,40,28,0.06), inset 0 0 0 1.5px #2ECC71",
        }}
      >
        {category ? (
          <span className="text-[17px] leading-none">{category.emoji}</span>
        ) : (
          <UtensilsCrossed size={17} strokeWidth={2.4} color="#15291C" />
        )}
      </span>
      <span className="flex flex-1 items-center">
        <span className="text-[16.5px] leading-snug font-bold tracking-[0px] text-[#15291C]">
          {category ? category.label : "Выберите блюдо"}
        </span>
      </span>
      <span className="ml-auto grid size-[26px] place-items-center rounded-full bg-[rgba(20,40,28,0.06)]">
        <ChevronRight size={14} strokeWidth={2.4} color="#15291C" />
      </span>
    </button>
  );
}

function TagsInput({
  brand,
  tags,
  tagDraft,
  onTagDraftChange,
  onAddTag,
  onRemoveTag,
}: {
  brand: string;
  tags: string[];
  tagDraft: string;
  onTagDraftChange: (tag: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
}) {
  const canAddMoreTags = tags.length < MAX_TAGS;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    onAddTag();
  }

  return (
    <section>
      <h2 className="text-[22px] leading-tight font-semibold text-[#15291C] max-[380px]:text-[20px]">
        Теги
      </h2>
      <p className="mt-1 mb-2 font-[family-name:var(--font-roboto)] text-[13px] leading-snug font-medium text-[#5C6B62]">
        Нажмите Enter для добавления
      </p>
      <GlassSurface
        className={cn(FIELD_SURFACE_CLASSES, "min-h-[52px] h-auto")}
        tintClassName={FIELD_TINT_CLASSES}
        highlightClassName="after:border-[0.5px] after:border-white/58 after:shadow-[inset_1px_1px_0_rgba(255,255,255,0.74),inset_-1px_-1px_0_rgba(255,255,255,0.26)]"
        style={getReviewChromeStyle(brand)}
      >
        <div className="flex min-h-[50px] flex-wrap items-center gap-1.5 px-2.5 py-2">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onRemoveTag(tag)}
              className={cn(
                "origin-center cursor-pointer select-none border-0 outline-none",
                "inline-flex h-[26px] items-center justify-center gap-1 rounded-full bg-white px-2.5 text-[11.5px] font-bold tracking-[0px] text-[#5C6B62] shadow-[inset_0_0_0_1.4px_rgba(20,40,28,0.10)]",
                "transition-transform duration-150 ease-out active:scale-[0.94] [-webkit-tap-highlight-color:transparent]",
                "[@media(max-width:430px)_and_(max-height:860px)]:h-6 [@media(max-width:430px)_and_(max-height:860px)]:px-2 [@media(max-width:430px)_and_(max-height:860px)]:text-[11px]"
              )}
            >
              <span className="flex h-full items-center justify-center leading-[26px]">
                #{tag}
              </span>
              <X className="size-3" strokeWidth={2.2} aria-hidden="true" />
            </button>
          ))}
          {canAddMoreTags && (
            <Input
              value={tagDraft}
              maxLength={32}
              onChange={(event) => onTagDraftChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Новый тег..."
              className={cn(FIELD_INPUT_CLASSES, "h-8 min-w-[120px] flex-1 px-1.5")}
            />
          )}
        </div>
      </GlassSurface>
    </section>
  );
}

export function NewReviewForm({ brand, palette }: NewReviewFormProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [dish, setDish] = useState("");
  const [price, setPrice] = useState("");
  const [place, setPlace] = useState("");
  const [address, setAddress] = useState("");
  const [rating, setRating] = useState(0);
  const [photos, setPhotos] = useState<File[]>([]);
  const [review, setReview] = useState("");
  const [category, setCategory] = useState<FoodCategory | null>(null);
  // true — категорию выбрал юзер вручную (авто-распознавание больше не вмешивается).
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [showRequiredAlert, setShowRequiredAlert] = useState(false);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const requiredAlertTimerRef = useRef<number | null>(null);
  const hasDraft =
    dish.trim().length > 0 ||
    price.trim().length > 0 ||
    place.trim().length > 0 ||
    address.trim().length > 0 ||
    photos.length > 0 ||
    review.trim().length > 0 ||
    category !== null ||
    tagDraft.trim().length > 0 ||
    tags.length > 0;
  const isPublishReady =
    dish.trim().length > 0 &&
    price.trim().length > 0 &&
    place.trim().length > 0 &&
    address.trim().length > 0 &&
    rating > 0 &&
    photos.length > 0 &&
    review.trim().length > 0 &&
    category !== null;

  useEffect(() => {
    return () => {
      if (requiredAlertTimerRef.current) {
        window.clearTimeout(requiredAlertTimerRef.current);
      }
    };
  }, []);

  // Авто-подстановка категории по названию блюда (с дебаунсом). Не трогаем,
  // если юзер выбрал категорию вручную.
  useEffect(() => {
    if (categoryTouched) return;
    const handle = window.setTimeout(() => {
      setCategory(detectDishCategory(dish));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [dish, categoryTouched]);

  function leaveForm() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  }

  function handleBackClick() {
    if (hasDraft) {
      setShowDraftDialog(true);
      return;
    }

    leaveForm();
  }

  function handleDiscardDraft() {
    setShowDraftDialog(false);
    leaveForm();
  }

  function addTag() {
    const normalizedTag = tagDraft.trim().replace(/^#+/, "");
    const normalizedTagKey = normalizedTag.toLocaleLowerCase("ru-RU");

    if (
      !normalizedTag ||
      tags.some((tag) => tag.toLocaleLowerCase("ru-RU") === normalizedTagKey) ||
      tags.length >= MAX_TAGS
    ) {
      setTagDraft("");
      return;
    }

    setTags((currentTags) => [...currentTags, normalizedTag]);
    setTagDraft("");
  }

  function showRequiredFieldsAlert() {
    if (requiredAlertTimerRef.current) {
      window.clearTimeout(requiredAlertTimerRef.current);
    }

    setShowRequiredAlert(true);
    requiredAlertTimerRef.current = window.setTimeout(() => {
      setShowRequiredAlert(false);
      requiredAlertTimerRef.current = null;
    }, REQUIRED_ALERT_MS);
  }

  async function handlePublishClick() {
    if (!isPublishReady) {
      showRequiredFieldsAlert();
      return;
    }

    setShowRequiredAlert(false);
    setSubmitError(null);
    setIsSubmitting(true);

    const fd = new FormData();
    fd.append("title", dish.trim());
    fd.append("description", review.trim());
    fd.append("userRating", String(rating));
    if (price.trim()) fd.append("price", price.trim());
    fd.append("restaurantName", place.trim());
    if (address.trim()) fd.append("restaurantAddress", address.trim());
    if (category) fd.append("category", category.label);
    tags.forEach((t) => fd.append("tags", t));
    photos.forEach((file) => fd.append("image", file));

    try {
      const res = await createPost(fd);
      if (res?.error) {
        setSubmitError(res.error);
        setIsSubmitting(false);
        return;
      }
      router.push("/profile");
    } catch (e: unknown) {
      setSubmitError(
        e instanceof Error ? e.message : "Не удалось опубликовать"
      );
      setIsSubmitting(false);
    }
  }

  function handleSelectCategory(nextCategory: FoodCategory) {
    setCategory(nextCategory);
    setCategoryTouched(true);
    setShowCategoryPicker(false);
  }

  if (showCategoryPicker) {
    return (
      <CategorySelectionScreen
        brand={brand}
        palette={palette}
        source="review"
        onBack={() => setShowCategoryPicker(false)}
        onSelectCategory={handleSelectCategory}
      />
    );
  }

  return (
    <ReviewScreen palette={palette}>
      <AnimatePresence>
        {showRequiredAlert && (
          <motion.div
            className="pointer-events-none absolute top-18 right-0 left-0 z-20 px-[18px]"
            initial={{ opacity: 0, y: -28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={
              canAnimate(shouldReduceMotion)
                ? { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
                : { duration: 0 }
            }
          >
            <Alert className="rounded-[18px] border-red-400/70 bg-white/86 px-4 py-3 text-[#15291C] shadow-[0_12px_28px_rgba(20,40,28,0.12),inset_1px_1px_0_rgba(255,255,255,0.72)] backdrop-blur-[18px]">
              <CircleAlert
                className="size-4"
                color="#EF4444"
                strokeWidth={2.3}
                aria-hidden="true"
              />
              <AlertDescription className="font-[family-name:var(--font-roboto)] text-[14px] leading-snug font-medium text-[#15291C]">
                Необходимо заполнить все поля
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>
      <AlertDialog open={showDraftDialog} onOpenChange={setShowDraftDialog}>
        <AlertDialogContent className="rounded-[24px] border-0 bg-white/88 p-5 text-[#15291C] shadow-[0_22px_54px_rgba(20,40,28,0.34),0_8px_18px_rgba(20,40,28,0.12),inset_1px_1px_0_rgba(255,255,255,0.74)] ring-0 backdrop-blur-[22px]">
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle className="text-[20px] leading-tight font-semibold text-[#15291C]">
              Удалить черновик?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-[family-name:var(--font-roboto)] text-[14px] leading-snug font-medium text-[#5C6B62]">
              Вы написали отличный отзыв, но если вы уйдёте сейчас, текст
              удалится.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-5 -mb-5 flex-col gap-2 rounded-b-[24px] border-t border-white/58 bg-white/45 p-5 sm:flex-col">
            <AlertDialogCancel
              className="h-10 w-full rounded-[18px] border border-transparent bg-white px-4 text-[14px] font-bold text-[#15291C] shadow-[0_8px_20px_rgba(20,40,28,0.08),inset_1px_1px_0_rgba(255,255,255,0.72),inset_-1px_-1px_0_rgba(255,255,255,0.28)] hover:bg-white focus-visible:ring-[#15291C]/12"
              style={getReviewChromeStyle(brand)}
              onClick={() => setShowDraftDialog(false)}
            >
              Вернуться к отзыву
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="h-10 w-full rounded-[18px] border border-transparent bg-white px-4 text-[14px] font-bold text-[#8F1D1D] shadow-[0_8px_20px_rgba(60,20,20,0.08),inset_1px_1px_0_rgba(255,255,255,0.72),inset_-1px_-1px_0_rgba(255,255,255,0.28)] hover:bg-white focus-visible:ring-red-900/15"
              style={{
                background:
                  "linear-gradient(#FFFFFF,#FFFFFF) padding-box, linear-gradient(140deg, rgba(127,29,29,0.76), rgba(185,28,28,0.44), rgba(239,68,68,0.24), rgba(127,29,29,0.68)) border-box",
                boxShadow:
                  "0 6px 14px rgba(60,20,20,0.07), inset 1px 1px 0 rgba(255,255,255,0.18), inset -1px -1px 0 rgba(47,11,11,0.05)",
              }}
              onClick={handleDiscardDraft}
            >
              Удалить и выйти
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ReviewContentLayer>
        <ReviewScrollArea aria-label="Новая публикация">
          <ReviewScreenHeader
            title="Новая публикация"
            onBack={handleBackClick}
          />

          <div className="space-y-6">
            <PhotoUpload files={photos} onFilesChange={setPhotos} />

            <ReviewField
              brand={brand}
              label="Название блюда"
              placeholder="Например: Стейк Рибай"
              value={dish}
              maxLength={50}
              onChange={setDish}
            />

            <div>
              <CategoryButton
                category={category}
                onClick={() => setShowCategoryPicker(true)}
              />
              {category && !categoryTouched && (
                <p className="mt-1.5 px-1 font-[family-name:var(--font-roboto)] text-[12.5px] font-medium text-[#17913F]">
                  Определили автоматически по названию — можно сменить.
                </p>
              )}
            </div>

            <section>
              <h2 className="mb-2 text-[22px] leading-tight font-semibold tracking-[0px] text-[#15291C] max-[380px]:text-[20px]">
                Заведение
              </h2>
              <div className="space-y-1.5">
                <GlassSurface
                  className={FIELD_SURFACE_CLASSES}
                  contentClassName="h-full"
                  tintClassName={FIELD_TINT_CLASSES}
                  highlightClassName="after:border-[0.5px] after:border-white/58 after:shadow-[inset_1px_1px_0_rgba(255,255,255,0.74),inset_-1px_-1px_0_rgba(255,255,255,0.26)]"
                  style={getReviewChromeStyle(brand)}
                >
                  <div className="group flex h-full items-center gap-2 pr-3">
                    <Input
                      aria-label="Название заведения"
                      value={place}
                      onChange={(event) => setPlace(event.target.value)}
                      placeholder="Название заведения"
                      className={cn(FIELD_INPUT_CLASSES, "min-w-0 flex-1 pr-0")}
                    />
                    {place && (
                      <button
                        type="button"
                        aria-label="Очистить"
                        onClick={() => setPlace("")}
                        className={cn(
                          "grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[rgba(20,40,28,0.08)] p-0 text-[#3A4A40] opacity-0 transition-opacity group-focus-within:opacity-100",
                          PRESS_CLASSES
                        )}
                      >
                        <X className="size-[11px]" strokeWidth={2.4} />
                      </button>
                    )}
                  </div>
                </GlassSurface>
                <GlassSurface
                  className={FIELD_SURFACE_CLASSES}
                  contentClassName="h-full"
                  tintClassName={FIELD_TINT_CLASSES}
                  highlightClassName="after:border-[0.5px] after:border-white/58 after:shadow-[inset_1px_1px_0_rgba(255,255,255,0.74),inset_-1px_-1px_0_rgba(255,255,255,0.26)]"
                  style={getReviewChromeStyle(brand)}
                >
                  <div className="group flex h-full items-center gap-2 pr-3">
                    <Input
                      aria-label="Адрес заведения"
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      placeholder="Адрес (необязательно)"
                      className={cn(FIELD_INPUT_CLASSES, "min-w-0 flex-1 pr-0")}
                    />
                    {address && (
                      <button
                        type="button"
                        aria-label="Очистить"
                        onClick={() => setAddress("")}
                        className={cn(
                          "grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[rgba(20,40,28,0.08)] p-0 text-[#3A4A40] opacity-0 transition-opacity group-focus-within:opacity-100",
                          PRESS_CLASSES
                        )}
                      >
                        <X className="size-[11px]" strokeWidth={2.4} />
                      </button>
                    )}
                  </div>
                </GlassSurface>
              </div>
            </section>

            <ReviewField
              brand={brand}
              label="Цена (₽)"
              placeholder="Например: 450"
              value={price}
              inputMode="decimal"
              onChange={setPrice}
            />

            <RatingControl
              rating={rating}
              shouldReduceMotion={shouldReduceMotion}
              onRate={setRating}
            />

            <section>
              <div className="mb-2 flex items-end justify-between gap-3">
                <h2 className="text-[22px] leading-tight font-semibold text-[#15291C] max-[380px]:text-[20px]">
                  Впечатления
                </h2>
                <span className="pb-0.5 text-[12px] font-bold text-[#5C6B62]">
                  {review.length}/{MAX_REVIEW_LENGTH}
                </span>
              </div>
              <GlassSurface
                className="min-h-[124px] rounded-[22px] border border-transparent bg-white transition-shadow duration-150 focus-within:ring-2 focus-within:ring-[#15291C]/12"
                tintClassName={FIELD_TINT_CLASSES}
                highlightClassName="after:border-[0.5px] after:border-white/58 after:shadow-[inset_1px_1px_0_rgba(255,255,255,0.74),inset_-1px_-1px_0_rgba(255,255,255,0.26)]"
                style={getReviewChromeStyle(brand)}
              >
                <Textarea
                  value={review}
                  maxLength={MAX_REVIEW_LENGTH}
                  onChange={(event) => setReview(event.target.value)}
                  placeholder="Что понравилось, что можно улучшить?"
                  className="min-h-[124px] resize-none border-0 bg-transparent px-3.5 py-3 text-[15px] font-medium text-[#15291C] shadow-none outline-none placeholder:text-[#8A958E] focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-transparent md:text-[15px]"
                />
              </GlassSurface>
            </section>

            <TagsInput
              brand={brand}
              tags={tags}
              tagDraft={tagDraft}
              onTagDraftChange={setTagDraft}
              onAddTag={addTag}
              onRemoveTag={(tag) =>
                setTags((currentTags) =>
                  currentTags.filter((currentTag) => currentTag !== tag)
                )
              }
            />

            {submitError && (
              <div className="rounded-2xl border border-red-300 bg-red-50/80 px-4 py-3 text-center text-[14px] font-semibold text-red-700">
                {submitError}
              </div>
            )}

            <div className="flex justify-center pt-5">
              <button
                type="button"
                aria-label="Опубликовать"
                onClick={handlePublishClick}
                disabled={isSubmitting}
                className={cn(
                  "h-12 min-w-[256px] rounded-full px-7 text-[18px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#15291C]/18 active:scale-[0.97]",
                  isPublishReady
                    ? "bg-white text-[#17913F] shadow-[inset_0_0_0_1.6px_#2ECC71,0_6px_16px_rgba(20,40,28,0.08)]"
                    : "bg-[rgba(20,40,28,0.06)] text-[#8A958E]",
                  isSubmitting && "pointer-events-none opacity-60"
                )}
              >
                {isSubmitting ? "Публикация..." : "Опубликовать"}
              </button>
            </div>
          </div>
        </ReviewScrollArea>
      </ReviewContentLayer>
    </ReviewScreen>
  );
}
