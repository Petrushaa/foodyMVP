import { cn } from "@/lib/utils";

/**
 * Оформление полей ввода в формах на стекле.
 *
 * Раньше эти строки лежали копиями в пяти файлах и успели разойтись: где-то
 * потерялся transition, где-то — focus-visible. Правка «поправить поля»
 * означала найти все копии и не забыть ни одной.
 */

/** Рамка поля фиксированной высоты — под однострочный ввод с иконкой. */
export const FIELD_SURFACE = cn(
  "relative h-[50px] rounded-[18px] border border-white/65 bg-transparent",
  "shadow-[0_8px_20px_rgba(20,40,28,0.08),inset_1px_1px_0_rgba(255,255,255,0.72)]",
  "backdrop-blur-[16px] backdrop-saturate-[170%] transition-shadow duration-150",
  "focus-within:ring-2 focus-within:ring-[#15291C]/12",
);

/** То же, но по высоте содержимого: для textarea и полей в несколько строк. */
export const FIELD_SURFACE_AUTO = cn(
  "relative rounded-[18px] border border-white/65 bg-transparent",
  "shadow-[0_8px_20px_rgba(20,40,28,0.08),inset_1px_1px_0_rgba(255,255,255,0.72)]",
  "backdrop-blur-[16px] backdrop-saturate-[170%]",
  "focus-within:ring-2 focus-within:ring-[#15291C]/12",
);

const FIELD_BASE =
  "h-[50px] border-0 bg-transparent py-0 text-[15.5px] leading-[50px] font-semibold text-[#15291C] shadow-none outline-none placeholder:text-[#8A958E] focus-visible:border-transparent focus-visible:ring-0";

/** Поле с иконкой слева — отступ слева освобождает под неё место. */
export const FIELD_INPUT = cn(FIELD_BASE, "pl-11 pr-3.5");

/** Поле без иконки. */
export const FIELD_INPUT_PLAIN = cn(FIELD_BASE, "px-3.5");
