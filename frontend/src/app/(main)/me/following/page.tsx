import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { apiRequest } from "@/lib/api";
import { PeopleList } from "@/components/profile/people-list";

export const dynamic = "force-dynamic";

export default async function MyFollowingPage() {
    const session = (await auth()) as any;
    if (!session?.user?.accessToken) {
        redirect("/login");
    }

    const token = session.user.accessToken;
    const me = await apiRequest("/users/me/", {
        headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);

    if (!me?.id) {
        redirect("/me");
    }

    return (
        <PeopleList
            title="Подписки"
            endpoint={`/users/${me.id}/following/`}
            emptyText="Вы пока ни на кого не подписаны."
            accessToken={token}
            backHref="/me"
        />
    );
}
