"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { apiRequest } from "@/lib/api";






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
