"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Check, X, ZoomIn } from "lucide-react";

import { cn } from "@/lib/utils";

const PRESS_CLASSES =
  "origin-center transition-transform duration-150 ease-out active:scale-[0.94] [-webkit-tap-highlight-color:transparent]";

// Размер экспортируемого квадрата (px). Кроп квадратный — как фото в ленте.
const OUTPUT_SIZE = 1080;
const MAX_ZOOM = 3;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

type PhotoCropModalProps = {
  file: File;
  onCancel: () => void;
  onApply: (croppedFile: File) => void;
};

/**
 * Обрезка фото с предпросмотром: квадратная рамка (как в ленте), пан мышью/
 * пальцем и зум ползунком. То, что в рамке, — то и попадёт в пост.
 */
export function PhotoCropModal({ file, onCancel, onApply }: PhotoCropModalProps) {
  // Ссылку создаём и отзываем в одном эффекте. Раньше она жила в useMemo,
  // а отзывалась в эффекте — и в строгом режиме, где React монтирует дважды,
  // очистка убивала ссылку, которую useMemo при повторном монтировании уже
  // не пересчитывал. Кадр оставался пустым, а «Готово» — заблокированным.
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    setFailed(false);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null
  );

  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [frameSize, setFrameSize] = useState(320);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  // Замер рамки.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const update = () => setFrameSize(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const coverScale = nat ? frameSize / Math.min(nat.w, nat.h) : 1;
  const scale = coverScale * zoom;
  const dispW = nat ? nat.w * scale : frameSize;
  const dispH = nat ? nat.h * scale : frameSize;
  const maxX = Math.max(0, (dispW - frameSize) / 2);
  const maxY = Math.max(0, (dispH - frameSize) / 2);

  const clampOffset = useCallback(
    (o: { x: number; y: number }) => ({
      x: clamp(o.x, -maxX, maxX),
      y: clamp(o.y, -maxY, maxY),
    }),
    [maxX, maxY]
  );

  // Подрезаем смещение при изменении зума/размеров.
  useEffect(() => {
    setOffset((o) => ({ x: clamp(o.x, -maxX, maxX), y: clamp(o.y, -maxY, maxY) }));
  }, [maxX, maxY]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    setOffset(
      clampOffset({
        x: d.ox + (event.clientX - d.x),
        y: d.oy + (event.clientY - d.y),
      })
    );
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function handleApply() {
    const img = imgRef.current;
    if (!img || !nat) return;
    setBusy(true);

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setBusy(false);
      return;
    }

    // Область исходника, видимая в рамке.
    const sSize = frameSize / scale;
    const sCenterX = nat.w / 2 - offset.x / scale;
    const sCenterY = nat.h / 2 - offset.y / scale;
    const sx = sCenterX - sSize / 2;
    const sy = sCenterY - sSize / 2;

    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setBusy(false);
          return;
        }
        const baseName = file.name.replace(/\.[^./\\]+$/, "");
        const cropped = new File([blob], `${baseName}.jpg`, {
          type: "image/jpeg",
        });
        onApply(cropped);
      },
      "image/jpeg",
      0.9
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#101512]">
      <header className="flex items-center justify-between px-4 pt-3 pb-2">
        <button
          type="button"
          aria-label="Отмена"
          onClick={onCancel}
          className={cn(
            "grid size-9 place-items-center rounded-full bg-white/10 text-white",
            PRESS_CLASSES
          )}
        >
          <X className="size-5" strokeWidth={2.2} />
        </button>
        <span className="text-[15px] font-bold text-white">Обрезка фото</span>
        <button
          type="button"
          aria-label="Готово"
          onClick={handleApply}
          disabled={busy || !nat}
          className={cn(
            "grid size-9 place-items-center rounded-full bg-[#2ECC71] text-white disabled:opacity-50",
            PRESS_CLASSES
          )}
        >
          <Check className="size-5" strokeWidth={2.6} />
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-5">
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative aspect-square w-full max-w-[360px] cursor-grab touch-none overflow-hidden rounded-[18px] bg-black select-none active:cursor-grabbing"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={url ?? undefined}
            alt="Обрезка"
            draggable={false}
            onLoad={(e) =>
              setNat({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
            // Молчаливо пустой кадр не отличить от «ещё грузится»: если снимок
            // не открылся, честно говорим об этом, а не оставляем чёрный квадрат.
            onError={() => setFailed(true)}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: nat ? dispW : undefined,
              height: nat ? dispH : undefined,
              maxWidth: "none",
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
            }}
            className="pointer-events-none select-none"
          />
          {failed && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 px-6 text-center">
              <p className="text-[14px] font-semibold text-white/90">
                Не удалось открыть снимок. Отмените и выберите фото заново.
              </p>
            </div>
          )}

          {/* сетка-подсказка */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/12" />
            ))}
          </div>
        </div>

        <p className="mt-3 text-center text-[12.5px] font-medium text-white/60">
          Перетаскивайте фото и меняйте масштаб — что в рамке, то и в посте.
        </p>

        <div className="mt-4 flex w-full max-w-[360px] items-center gap-3">
          <ZoomIn className="size-5 shrink-0 text-white/70" strokeWidth={2.2} />
          <input
            type="range"
            aria-label="Масштаб"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-[#2ECC71]"
          />
        </div>
      </div>

      <div className="px-5 pt-2 pb-6">
        <button
          type="button"
          onClick={handleApply}
          disabled={busy || !nat}
          className={cn(
            "h-12 w-full rounded-[14px] bg-[#2ECC71] text-[15px] font-extrabold text-white disabled:opacity-50",
            PRESS_CLASSES
          )}
        >
          Готово
        </button>
      </div>
    </div>
  );
}
