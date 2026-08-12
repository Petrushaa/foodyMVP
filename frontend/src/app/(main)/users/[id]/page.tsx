import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { apiRequest, fixMediaUrl, mapDjangoPostToDish } from "@/lib/api";
import SubscribeButton from "@/components/SubscribeButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GlassSurface } from "@/components/feed/glass-surface";

function PostThumb({ post }: { post: any }) {
  return (
    <Link
      href={`/dish/${post.id}`}
      className="group block aspect-square overflow-hidden rounded-2xl border border-white/65 bg-white/55 shadow-[0_8px_22px_rgba(20,40,28,0.08),inset_1px_1px_0_rgba(255,255,255,0.7)] backdrop-blur-[16px]"
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
              ★ {Number(post.userRating || 0).toFixed(1)}
            </p>
          </div>
        </div>
      )}
    </Link>
  );
}

export default async function UserProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = (await auth()) as any;

  const options: any = { headers: {} };
  if (session?.user?.accessToken) {
    options.headers.Authorization = `Bearer ${session.user.accessToken}`;
  }

  // Redirect to /profile if this is the logged-in user's own page.
  // session.user.id is now set to the real Django user ID (see auth.ts authorize).
  if (session?.user?.id?.toString() === id) {
    redirect("/me");
  }

  // Double-check via /users/me/ in case id wasn't populated (e.g. old session)
  if (session?.user?.accessToken) {
    try {
      const me = await apiRequest("/users/me/", options);
      if (me?.id?.toString() === id) {
        redirect("/me");
      }
    } catch {
      // ignore
    }
  }

  const [postsData, userProfile] = await Promise.all([
    apiRequest(`/posts/user_posts/?user_id=${id}`, options).catch(() => ({ results: [] })),
    apiRequest(`/users/${id}/`, options).catch(() => null),
  ]);

  const posts = Array.isArray(postsData?.results || postsData)
    ? (postsData?.results || postsData).map(mapDjangoPostToDish)
    : [];

  if (!userProfile) {
    return (
      <main className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 flex flex-col px-4 pt-16 pb-25">
          <GlassSurface className="flex flex-1 items-center justify-center rounded-[26px] border border-white/65 bg-white/45">
            <div className="max-w-[280px] px-6 text-center">
              <p className="text-[20px] font-extrabold text-[#15291C]">Пользователь не найден</p>
            </div>
          </GlassSurface>
        </div>
      </main>
    );
  }

  const handle = userProfile.username || `user_${id}`;
  const name = userProfile.full_name || userProfile.username || "Пользователь";
  const avatar = fixMediaUrl(userProfile.avatar) || "";
  const city = userProfile.city || "";
  const bio = userProfile.bio_text || "";
  const stats = {
    posts: userProfile.posts_count ?? posts.length,
    followers: userProfile.followers_count ?? 0,
    following: userProfile.following_count ?? 0,
  };

  return (
    <main className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 flex flex-col pt-2">
        <header className="flex items-center justify-between px-5 pb-3">
          <Link
            href="/"
            aria-label="Назад"
            className="grid size-10 place-items-center rounded-full border border-white/65 bg-white/58 text-[#15291C] shadow-[0_8px_20px_rgba(20,40,28,0.12),inset_1px_1px_0_rgba(255,255,255,0.78)] backdrop-blur-[18px]"
          >
            <ArrowLeft className="size-5" strokeWidth={2.2} />
          </Link>
          <h1 className="text-[18px] font-extrabold tracking-[-0.3px] text-[#15291C]">
            @{handle}
          </h1>
          <span className="size-10" />
        </header>

        <section className="hide-scroll flex-1 overflow-y-auto px-4 pb-25">
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

              {bio && (
                <p className="mt-3 max-w-md text-[14px] leading-[1.45] font-medium text-[#5C6B62]">
                  {bio}
                </p>
              )}

              <div className="mt-4">
                <SubscribeButton
                  userId={id}
                  initialIsFollowing={userProfile.is_following || false}
                  session={session}
                />
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3 w-full max-w-sm">
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

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {posts.length === 0 ? (
              <div className="col-span-full py-10 text-center text-[14px] font-medium text-[#5C6B62]">
                У пользователя пока нет постов.
              </div>
            ) : (
              posts.map((p: any) => <PostThumb key={p.id} post={p} />)
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
