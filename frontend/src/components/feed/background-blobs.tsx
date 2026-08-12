import type { Palette } from "@/lib/mock-data";

type BackgroundBlobsProps = {
  // Проп сохранён для обратной совместимости с местами вызова, но фон теперь
  // плоский нейтральный и от палитры не зависит.
  palette?: Palette;
};

export function BackgroundBlobs(_props: BackgroundBlobsProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[#F6F7F6]"
    />
  );
}
