import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings as SettingsIcon, MapPin, ShieldCheck, Clock, AlertTriangle } from "lucide-react";
import { apiRequest, fixAvatarUrl, mapDjangoPostToDish } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GlassSurface } from "@/components/feed/glass-surface";

export const dynamic = "force-dynamic";

function PostThumb({ post }: { post: any }) {
  // status приходит из mapDjangoPostToDish (lib/api.ts) — pending / approved / rejected.
  // Для своих постов на /me показываем бейдж только если НЕ approved, чтобы автор
  // понимал где какой пост в воронке.
  const status: string | undefined = post.status;
  const isPending = status === "pending";
  const isRejected = status === "rejected";
  return (
    <Link
      href={`/dish/${post.id}`}
      className="group relative block aspect-square overflow-hidden rounded-2xl border border-white/65 bg-white/55 shadow-[0_8px_22px_rgba(20,40,28,0.08),inset_1px_1px_0_rgba(255,255,255,0.7)] backdrop-blur-[16px]"
    >
      {post.imageUrl && post.imageUrl !== "/placeholder.png" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl}
          alt={post.title}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="grid size-full place-items-center bg-[linear-gradient(135deg,rgba(220,230,222,0.5),rgba(255,255,255,0.7))] p-3 text-center">
          <div>
            <p className="text-[14px] font-semibold text-[#15291C]">{post.title}</p>
            <p className="mt-1 text-[11px] font-medium text-[#5C6B62]">
              {Number(post.userRating || 0).toFixed(1)}
            </p>
          </div>
        </div>
      )}
      {(isPending || isRejected) && (
        <>
          {/* затемнение чтобы бейдж читался поверх любых фото */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-black/45 to-transparent" />
          <div
            className={
              "pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-bold uppercase tracking-wide shadow-[0_4px_10px_rgba(20,40,28,0.18)] " +
              (isPending
                ? "bg-amber-100/95 text-amber-900"
                : "bg-red-100/95 text-red-900")
            }
          >
            {isPending ? (
              <>
                <Clock className="size-3" strokeWidth={2.6} />
                На модерации
              </>
            ) : (
              <>
                <AlertTriangle className="size-3" strokeWidth={2.6} />
                Отклонён
              </>
            )}
          </div>
        </>
      )}
    </Link>
  );
}

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ profileSaved?: string }>;
}) {
  const { profileSaved } = await searchParams;

  const session = (await auth()) as any;
  if (!session?.user?.accessToken) {
    redirect("/login");
  }

  const token = session.user.accessToken;
  let userProfile: any = null;
  let postsResult: any[] = [];

  try {
    const [posts, me] = await Promise.all([
      apiRequest("/posts/?author=me", { headers: { Authorization: `Bearer ${token}` } }),
      apiRequest("/users/me/", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
    ]);
    postsResult = Array.isArray(posts?.results || posts)
      ? (posts?.results || posts).map(mapDjangoPostToDish)
      : [];
    userProfile = me;
  } catch (e: any) {
    if (e?.message === "UNAUTHORIZED") redirect("/login");
  }

  const handle = userProfile?.username || session.user.email?.split("@")[0] || "user";
  const name = userProfile?.full_name || userProfile?.username || "Пользователь";
  const avatar = fixAvatarUrl(userProfile?.avatar) || "";
  const city = userProfile?.city || "";
  const bio = userProfile?.bio_text || "";
  const stats = {
    posts: userProfile?.posts_count ?? postsResult.length,
    followers: userProfile?.followers_count ?? 0,
    following: userProfile?.following_count ?? 0,
  };

  return (
    <main className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 flex flex-col pt-2">
        <header className="flex items-center justify-between px-5 pb-3">
          <h1 className="text-[20px] font-extrabold tracking-[-0.3px] text-[#15291C]">
            @{handle}
          </h1>
          <Link
            href="/settings"
            aria-label="Настройки"
            className="grid size-10 place-items-center rounded-full border border-white/65 bg-white/58 text-[#15291C] shadow-[0_8px_20px_rgba(20,40,28,0.12),inset_1px_1px_0_rgba(255,255,255,0.78)] backdrop-blur-[18px]"
          >
            <SettingsIcon className="size-5" strokeWidth={2.2} />
          </Link>
        </header>

        <section className="hide-scroll flex-1 overflow-y-auto px-4 pb-25">
          {profileSaved === "1" && (
            <div className="mb-3 rounded-2xl border border-green-200 bg-green-50/80 px-4 py-3 text-center text-[13px] font-semibold text-green-800">
              Профиль сохранён
            </div>
          )}

          <GlassSurface className="rounded-[26px] border border-white/65 bg-white/45 px-5 py-6 shadow-[0_8px_24px_rgba(20,40,28,0.10),0_2px_6px_rgba(20,40,28,0.06)]">
            <div className="flex flex-col items-center text-center">
              <Avatar className="size-22 border-2 border-[#2ECC71] shadow-[0_10px_28px_rgba(20,40,28,0.18)] after:hidden">
                {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
                <AvatarFallback className="bg-white text-[24px] font-extrabold text-[#15291C]">
                  {name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <h2 className="mt-3 text-[22px] font-extrabold tracking-[-0.3px] text-[#15291C]">
                {name}
              </h2>

              {city && (
                <div className="mt-1 flex items-center gap-1 text-[13.5px] font-medium text-[#5C6B62]">
                  <MapPin className="size-4" strokeWidth={2} />
                  <span>{city}</span>
                </div>
              )}

              <p className="mt-3 max-w-md text-[14px] leading-[1.5] font-medium whitespace-pre-line text-[#5C6B62]">
                {bio || "Пока нет описания"}
              </p>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/me/edit"
                  className="inline-flex h-9 items-center rounded-full bg-white/82 px-5 text-[13px] font-bold text-[#15291C] shadow-[inset_1px_1px_0_rgba(255,255,255,0.85),0_6px_16px_rgba(20,40,28,0.1)] hover:bg-white"
                >
                  Редактировать профиль
                </Link>
                {userProfile?.is_staff && (
                  <Link
                    href="/staff"
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1FA85C] px-4 text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(31,168,92,0.32)] hover:bg-[#168B4A]"
                  >
                    <ShieldCheck className="size-4" />
                    Модерация
                  </Link>
                )}
              </div>

              <div className="mt-5 grid w-full max-w-sm grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="text-[20px] font-extrabold text-[#15291C]">{stats.posts}</div>
                  <div className="text-[11.5px] font-semibold tracking-wide text-[#8A958E] uppercase">Посты</div>
                </div>
                <div className="text-center">
                  <div className="text-[20px] font-extrabold text-[#15291C]">{stats.followers}</div>
                  <div className="text-[11.5px] font-semibold tracking-wide text-[#8A958E] uppercase">Подписчики</div>
                </div>
                <div className="text-center">
                  <div className="text-[20px] font-extrabold text-[#15291C]">{stats.following}</div>
                  <div className="text-[11.5px] font-semibold tracking-wide text-[#8A958E] uppercase">Подписки</div>
                </div>
              </div>
            </div>
          </GlassSurface>

          <h2 className="mt-6 mb-1 px-1 text-[16px] font-extrabold tracking-[-0.2px] text-[#15291C]">
            Мои посты
          </h2>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {postsResult.length === 0 ? (
              <div className="col-span-full py-10 text-center text-[14px] font-medium text-[#5C6B62]">
                У вас пока нет постов.
              </div>
            ) : (
              postsResult.map((p: any) => <PostThumb key={p.id} post={p} />)
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
