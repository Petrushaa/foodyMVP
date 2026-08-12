import { BackgroundBlobs } from "@/components/feed/background-blobs";
import { DEFAULT_TWEAKS } from "@/lib/tweaks";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackgroundBlobs palette={DEFAULT_TWEAKS.palette} />
      {/* На десктопе (lg) body без капа — держим login/register центрированной
          колонкой (без сайдбара), чтобы форма не растягивалась во всю ширину. */}
      <div className="absolute inset-0 lg:inset-y-0 lg:right-0 lg:left-0 lg:mx-auto lg:w-[480px]">
        {children}
      </div>
    </>
  );
}
