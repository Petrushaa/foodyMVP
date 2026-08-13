"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { apiRequest } from "@/lib/api";

export async function toggleLike(dishId: string) {
    const session = await auth() as any;
    if (!session?.user?.accessToken) return { error: "Not authenticated" };

    try {
        await apiRequest(`/posts/${dishId}/like/`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${session.user.accessToken}`,
            },
        });
        revalidatePath(`/dish/${dishId}`);
        revalidatePath('/');
        return { success: true };
    } catch (e: any) {
        return { error: e.message };
    }
}

export async function toggleSave(dishId: string) {
    const session = await auth() as any;
    if (!session?.user?.accessToken) return { error: "Not authenticated" };

    try {
        await apiRequest(`/posts/${dishId}/save/`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${session.user.accessToken}`,
            },
        });
        revalidatePath(`/dish/${dishId}`);
        revalidatePath('/favorites');
        return { success: true };
    } catch (e: any) {
        return { error: e.message };
    }
}

export async function getDishComments(dishId: string) {
    const session = await auth() as any;
    
    const headers: Record<string, string> = {
        "Content-Type": "application/json"
    };
    if (session?.user?.accessToken) {
        headers["Authorization"] = `Bearer ${session.user.accessToken}`;
    }

    try {
        const res = await apiRequest(`/comments/?post=${dishId}`, {
            headers,
            cache: 'no-store'
        });
        return res?.results ? res.results : res;
    } catch (e: any) {
        console.error(e);
        return [];
    }
}

export async function createComment(dishId: string, text: string) {
    const session = await auth() as any;
    if (!session?.user?.accessToken) return { error: "Not authenticated" };

    try {
        await apiRequest(`/comments/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.user.accessToken}`,
            },
            body: JSON.stringify({ post: Number(dishId), text }),
        });

        revalidatePath('/');
        revalidatePath('/profile');
        revalidatePath(`/dish/${dishId}`);
        return { success: true };
    } catch (e: any) {
        return { error: e.message };
    }
}

export async function getCurrentUserAvatar() {
    const session = await auth() as any;
    if (!session?.user?.accessToken) return null;
    try {
        const me = await apiRequest("/users/me/", {
            headers: { Authorization: `Bearer ${session.user.accessToken}` },
        });
        const { fixMediaUrl } = await import("@/lib/api");
        return me?.avatar ? fixMediaUrl(me.avatar) : null;
    } catch {
        return null;
    }
}

// F1: правильный эндпоинт для подписок — /api/v1/users/{id}/subscribe/
// POST — подписаться, DELETE — отписаться.
// Эндпоинты /follow/ и /unfollow/ НЕ существуют (вернут 404).
export async function toggleFollow(userId: string | number, isFollowing: boolean) {
    const session = await auth() as any;
    if (!session?.user?.accessToken) return { error: "Not authenticated" };

    try {
        const method = isFollowing ? "DELETE" : "POST";
        await apiRequest(`/users/${userId}/subscribe/`, {
            method,
            headers: {
                "Authorization": `Bearer ${session.user.accessToken}`,
            },
        });
        
        revalidatePath(`/users/${userId}`);
        revalidatePath('/profile');
        return { success: true };
    } catch (e: any) {
        return { error: e.message };
    }
}
