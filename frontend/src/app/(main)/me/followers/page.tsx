import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { apiRequest } from "@/lib/api";
import { PeopleList } from "@/components/profile/people-list";

export const dynamic = "force-dynamic";

export default async function MyFollowersPage() {
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
            title="Подписчики"
            endpoint={`/users/${me.id}/followers/`}
            emptyText="На вас пока никто не подписан."
            accessToken={token}
            backHref="/me"
        />
    );
}
