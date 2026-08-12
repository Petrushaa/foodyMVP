/**
 * Плоский нейтральный фон под контентом. Раньше зависел от палитры —
 * сейчас нет, проп убран вместе со старым слоем данных.
 */
export function BackgroundBlobs() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[#F6F7F6]"
    />
  );
}
