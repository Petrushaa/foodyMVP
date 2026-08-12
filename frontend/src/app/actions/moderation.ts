"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { apiRequest } from "@/lib/api";

export async function approvePost(postId: number | string) {
    const session = (await auth()) as any;
    if (!session?.user?.accessToken) {
        return { error: "Unauthorized" };
    }

    try {
        await apiRequest(`/moderation/${postId}/approve/`, {
            method: "POST",
            headers: { Authorization: `Bearer ${session.user.accessToken}` },
        });
        revalidatePath("/staff");
        revalidatePath("/");
        return { success: true };
    } catch (error: any) {
        console.error("Approve post error:", error);
        return { error: error.message || "Failed to approve post" };
    }
}

export async function rejectPost(postId: number | string, reason: string) {
    const session = (await auth()) as any;
    if (!session?.user?.accessToken) {
        return { error: "Unauthorized" };
    }

    try {
        await apiRequest(`/moderation/${postId}/reject/`, {
            method: "POST",
            headers: { Authorization: `Bearer ${session.user.accessToken}` },
            // Бэкенд ждёт поле reason; в модели оно хранится как rejection_reason.
            body: JSON.stringify({ reason: reason ?? "" }),
        });
        revalidatePath("/staff");
        return { success: true };
    } catch (error: any) {
        console.error("Reject post error:", error);
        return { error: error.message || "Failed to reject post" };
    }
}
