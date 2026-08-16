import { cn } from "@/lib/utils";

/**
 * Значок блюда или категории.
 *
 * Картинка старше эмодзи: справочник ведут админы, и пока иконка не загружена,
 * место занимает эмодзи. Поэтому заливать набор можно постепенно — пустых
 * квадратов в интерфейсе не появится.
 *
 * `fill` растягивает картинку на всю плитку. Иконки нарисованы с белым фоном
 * специально под это: маленькая картинка в центре белого квадрата теряется,
 * а во всю плитку — читается. Эмодзи в этом режиме остаётся по центру: тянуть
 * шрифтовой символ на весь квадрат нельзя.
 *
 * `aria-hidden` в обоих случаях: рядом всегда стоит подпись категории, и
 * читалке незачем проговаривать значок отдельно.
 */
export function CategoryIcon({
  icon,
  emoji,
  size = 24,
  fill = false,
  className,
}: {
  icon?: string | null;
  emoji?: string | null;
  size?: number;
  fill?: boolean;
  className?: string;
}) {
  if (icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt=""
        aria-hidden="true"
        className={cn(
          fill ? "size-full rounded-[inherit] object-cover" : "object-contain",
          className,
        )}
        style={fill ? undefined : { width: size, height: size }}
      />
    );
  }

  return (
    <span aria-hidden="true" className={className}>
      {emoji || "🍽️"}
    </span>
  );
}
