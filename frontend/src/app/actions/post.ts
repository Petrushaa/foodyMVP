"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { apiRequest, mapDjangoPostToDish } from "@/lib/api";


export async function createPost(formData: FormData) {
    const session = await auth() as any;
    if (!session?.user?.accessToken) {
        return { error: "Необходимо войти в систему" };
    }

    const title = formData.get("title") as string;
    const rawDescription = formData.get("description") as string;
    const description = rawDescription?.trim() ? rawDescription : "Без описания";
    const taste = formData.get("userRating") as string;

    // Форма даёт 0–5 звёзд, бэкенд хранит 0–10.
    const ratingValue = parseFloat(taste) || 0;
    const ratingBackend = Math.min(ratingValue * 2, 10);

    const newFormData = new FormData();
    // Название блюда теперь заводит позицию — блюдо в конкретном заведении.
    newFormData.append("menu_item_name", title);
    newFormData.append("description", description);
    // Оценка автора — оценка блюда тем, кто его ел.
    newFormData.append("author_rating", ratingBackend.toString());

    const priceStr = formData.get("price") as string;
    const priceValue = parseFloat(priceStr);
    if (!isNaN(priceValue)) {
        newFormData.append("price", priceValue.toFixed(2));
    }

    const restName = (formData.get("restaurantName") as string)?.trim();
    if (!restName) {
        return { error: "Укажите название заведения" };
    }
    newFormData.append("restaurant_name", restName);

    const restAddress = (formData.get("restaurantAddress") as string)?.trim();
    if (!restAddress) {
        return { error: "Укажите адрес заведения — без него его не отличить от тёзки" };
    }
    newFormData.append("restaurant_address", restAddress);

    // Город берём из профиля: в форме его нет, а уникальность заведения
    // считается по тройке «город + название + адрес».
    let city = (formData.get("restaurantCity") as string)?.trim() || "";
    if (!city) {
        try {
            const me = await apiRequest("/users/me/", {
                headers: { Authorization: `Bearer ${session.user.accessToken}` },
            });
            city = (me?.city || "").trim();
        } catch {
            // Профиль не прочитался — сообщим об этом ниже понятным текстом.
        }
    }
    if (!city) {
        return { error: "Укажите город в профиле — он нужен, чтобы не путать заведения из разных городов" };
    }
    newFormData.append("restaurant_city", city);

    // Категория из интерфейса — это тип блюда. Название сопоставит сервер:
    // «Бургеры» в списке фронта и «Бургер» в справочнике — одно и то же.
    const category = formData.get("category") as string;
    if (category) {
        newFormData.append("dish_type_name", category);
    }

    // Обработка тегов
    const tags = formData.getAll("tags") as string[];
    tags.forEach(tag => newFormData.append("tags_list", tag));

    // Обработка изображений
    const files = formData.getAll("image") as File[];
    files.forEach(file => {
        if (file.size > 0) {
            newFormData.append("uploaded_images", file);
        }
    });

    try {
        await apiRequest("/posts/", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${session.user.accessToken}`
            },
            body: newFormData as any
        });

        revalidatePath("/");
        revalidatePath("/profile");
        return { success: true };
    } catch (error: any) {
        console.error("Create post error:", error);
        return { error: error.message || "Ошибка при создании поста" };
    }
}

export async function deletePost(postId: string) {
    const session = await auth() as any;
    if (!session?.user?.accessToken) {
        return { error: "Unauthorized" };
    }

    try {
        await apiRequest(`/posts/${postId}/`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${session.user.accessToken}`
            }
        });

        revalidatePath("/profile");
        revalidatePath("/");
        return { success: true };
    } catch (error: any) {
        console.error("Delete post error:", error);
        return { error: error.message || "Failed to delete post" };
    }
}

export async function createComment(postId: string, text: string) {
    const session = await auth() as any;
    if (!session?.user?.accessToken) {
        return { error: "Unauthorized" };
    }

    try {
        const response = await apiRequest(`/posts/${postId}/comments/`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${session.user.accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ text })
        });

        revalidatePath(`/dish/${postId}`);
        return { success: true, data: response };
    } catch (error: any) {
        console.error("Create comment error:", error);
        return { error: error.message || "Failed to add comment" };
    }
}

export async function deleteComment(postId: string, commentId: number | string) {
    const session = await auth() as any;
    if (!session?.user?.accessToken) {
        return { error: "Unauthorized" };
    }
    try {
        await apiRequest(`/posts/${postId}/comments/${commentId}/`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${session.user.accessToken}`,
            },
        });
        revalidatePath(`/dish/${postId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Delete comment error:", error);
        return { error: error.message || "Failed to delete comment" };
    }
}

export async function getSearchPosts(query?: string, category?: string, accessToken?: string) {
    try {
        let endpoint = "/posts/";
        const params = new URLSearchParams();
        
        if (query) {
            params.append("search", query);
        }
        
        const queryString = params.toString();
        if (queryString) {
            endpoint += `?${queryString}`;
        }

        const options: any = {};
        if (accessToken) {
            options.headers = {
                "Authorization": `Bearer ${accessToken}`
            };
        }

        const data = await apiRequest(endpoint, options);
        
        const results = data?.results || data;
        
        if (!Array.isArray(results)) return [];

        return results.map(mapDjangoPostToDish);
    } catch (error: any) {
        console.error("Search error:", error);
        if (error.message === "UNAUTHORIZED") {
            throw error; // Перебрасываем 401 наверх, чтобы страницы могли редиректить
        }
        return [];
    }
}
export async function getFollowingPosts(accessToken?: string) {
    try {
        const options: any = {};
        if (accessToken) {
            options.headers = {
                "Authorization": `Bearer ${accessToken}`
            };
        }
        
        const response = await apiRequest("/posts/?feed=subscriptions", options);
        // Assuming your backend returns paginated results { results: [...] } or just an array
        const results = Array.isArray(response?.results) ? response.results : (Array.isArray(response) ? response : []);
        return results.map(mapDjangoPostToDish);
    } catch (error) {
        console.error("Search following posts error:", error);
        return [];
    }
}

export async function getTags(accessToken?: string) {
    try {
        const options: any = {};
        if (accessToken) options.headers = { "Authorization": `Bearer ${accessToken}` };
        const data = await apiRequest("/tags/", options);
        return data?.results || data || [];
    } catch (error) {
        console.error("Fetch tags error:", error);
        return [];
    }
}

export async function getCategories(accessToken?: string) {
    try {
        const options: any = {};
        if (accessToken) options.headers = { "Authorization": `Bearer ${accessToken}` };
        const data = await apiRequest("/categories/", options);
        return data?.results || data || [];
    } catch (error) {
        console.error("Fetch categories error:", error);
        return [];
    }
}

export async function getRestaurant(restaurantId: string | number, accessToken?: string) {
    try {
        const options: any = {};
        if (accessToken) options.headers = { 'Authorization': `Bearer ${accessToken}` };
        return await apiRequest(`/restaurants/${restaurantId}/`, options);
    } catch {
        return null;
    }
}

export async function getRestaurantPosts(restaurantId: string | number, accessToken?: string) {
    try {
        const options: any = {};
        if (accessToken) options.headers = { 'Authorization': `Bearer ${accessToken}` };
        return await apiRequest(`/posts/?restaurant_id=${restaurantId}`, options);
    } catch {
        return { results: [] };
    }
}
