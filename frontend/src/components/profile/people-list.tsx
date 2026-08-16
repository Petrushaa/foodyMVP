import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { UserAvatar } from "@/components/feed/user-avatar";
import { GlassSurface } from "@/components/feed/glass-surface";
import { apiRequest, fixAvatarUrl } from "@/lib/api";

type Person = {
    id: number;
    username: string;
    full_name?: string | null;
    avatar?: string | null;
    city?: string | null;
};

/**
 * Список людей: подписки или подписчики.
 *
 * Одна вёрстка на оба случая — отличаются только заголовком, ручкой бэка
 * и текстом пустого состояния.
 */
export async function PeopleList({
    title,
    endpoint,
    emptyText,
    accessToken,
    backHref,
}: {
    title: string;
    endpoint: string;
    emptyText: string;
    accessToken?: string;
    backHref: string;
}) {
    const options = accessToken
        ? { headers: { Authorization: `Bearer ${accessToken}` } }
        : {};
    const data = await apiRequest(endpoint, options).catch(() => null);
    const people: Person[] = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];

    return (
        <main className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 flex flex-col pt-2">
                <header className="flex items-center gap-3 px-5 pb-3">
                    <Link
                        href={backHref}
                        aria-label="Назад"
                        className="grid size-10 place-items-center rounded-full border border-white/65 bg-white/58 text-[#15291C] shadow-[0_8px_20px_rgba(20,40,28,0.12),inset_1px_1px_0_rgba(255,255,255,0.78)] backdrop-blur-[18px]"
                    >
                        <ChevronLeft className="size-5" strokeWidth={2.2} />
                    </Link>
                    <h1 className="text-[20px] font-extrabold tracking-[-0.3px] text-[#15291C]">
                        {title}
                    </h1>
                </header>

                <section className="hide-scroll flex-1 overflow-y-auto px-4 pb-25">
                    {people.length === 0 ? (
                        <div className="py-10 text-center text-[14px] font-medium text-[#5C6B62]">
                            {emptyText}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {people.map((person) => (
                                <Link key={person.id} href={`/users/${person.id}`}>
                                    <GlassSurface
                                        className="rounded-[22px] border border-white/65 bg-white/45 px-4 py-3 shadow-[0_8px_24px_rgba(20,40,28,0.10),0_2px_6px_rgba(20,40,28,0.06)]"
                                        contentClassName="flex items-center gap-3"
                                    >
                                        <UserAvatar
                                            name={person.full_name || person.username}
                                            src={fixAvatarUrl(person.avatar) || ""}
                                            size={44}
                                        />
                                        <div className="min-w-0">
                                            <div className="truncate text-[15px] font-extrabold tracking-[-0.2px] text-[#15291C]">
                                                {person.full_name || person.username}
                                            </div>
                                            <div className="truncate text-[12.5px] font-medium text-[#5C6B62]">
                                                @{person.username}
                                                {person.city ? ` · ${person.city}` : ""}
                                            </div>
                                        </div>
                                    </GlassSurface>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
