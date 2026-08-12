import { BackgroundBlobs } from "@/components/feed/background-blobs";
import { BottomTabBar } from "@/components/feed/bottom-tab-bar";
import { DesktopSidebar } from "@/components/feed/desktop-sidebar";
import { DEFAULT_TWEAKS } from "@/lib/tweaks";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <BackgroundBlobs palette={DEFAULT_TWEAKS.palette} />
      {/* Десктоп: левая навигация (на мобиле скрыта). */}
      <DesktopSidebar />
      {/* Колонка контента: на мобиле = вся рамка (absolute inset-0, как раньше),
          на десктопе (lg) — центрированная колонка по центру ВСЕГО экрана
          (сайдбар лежит в левом «поле», как в Instagram).
          Это позиционирующий предок для absolute-inset-0 страниц — их не трогаем.
          БЕЗ z-* (иначе новый stacking context и слои поедут). */}
      <div className="absolute inset-0 lg:mx-auto lg:w-[540px]">
        {children}
      </div>
      <BottomTabBar brand={DEFAULT_TWEAKS.brand} />
    </>
  );
}
