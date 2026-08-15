/**
 * Значок блюда или категории.
 *
 * Картинка старше эмодзи: справочник ведут админы, и пока иконка не загружена,
 * место занимает эмодзи. Поэтому заливать набор можно постепенно — пустых
 * квадратов в интерфейсе не появится.
 *
 * `aria-hidden` в обоих случаях: рядом всегда стоит подпись категории, и
 * читалке незачем проговаривать значок отдельно.
 */
export function CategoryIcon({
  icon,
  emoji,
  size = 24,
  className,
}: {
  icon?: string | null;
  emoji?: string | null;
  size?: number;
  className?: string;
}) {
  if (icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    );
  }

  return (
    <span aria-hidden="true" className={className}>
      {emoji || "🍽️"}
    </span>
  );
}
