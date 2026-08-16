import { Star } from "lucide-react";

const STAR_YELLOW = "#FFB400";
const STAR_EMPTY = "#DBDFDB";
/** На фотографии светло-серые звёзды теряются — там пустые делаем тёмными. */
const STAR_EMPTY_ON_PHOTO = "rgba(255,255,255,0.32)";

/**
 * Оценка пятью звёздами — тот же вид, что в ленте и в форме отзыва.
 *
 * Дробную часть показываем обрезкой по ширине, а не округлением: 4.5 должно
 * читаться как половина звезды, иначе разница между 4.2 и 4.8 пропадает.
 */
export function RatingStars({
  rating,
  size = 20,
  onPhoto = false,
}: {
  rating: number;
  size?: number;
  /** Поверх фотографии: меняет цвет незаполненных звёзд на полупрозрачный белый. */
  onPhoto?: boolean;
}) {
  const empty = onPhoto ? STAR_EMPTY_ON_PHOTO : STAR_EMPTY;

  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5"
      aria-label={`Оценка ${rating} из 5`}
    >
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.max(0, Math.min(1, rating - index));
        return (
          <span key={index} className="relative inline-grid place-items-center">
            <Star
              style={{ width: size, height: size }}
              strokeWidth={0}
              color={empty}
              fill={empty}
            />
            {fill > 0 && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - fill * 100}% 0 0)` }}
              >
                <Star
                  style={{ width: size, height: size }}
                  strokeWidth={0}
                  color={STAR_YELLOW}
                  fill={STAR_YELLOW}
                />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
