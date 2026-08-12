export interface User {
    id: string;
    name: string;
    username?: string;
    avatar: string;
    bio?: string;
    stats?: {
        posts: number;
        followers: number;
        following: number;
    };
}

export interface Restaurant {
    id: string;
    name: string;
    username?: string;
    location: { lat: number; lng: number };
    address: string;
}

export interface Dish {
    id: string;
    type: "user_post" | "restaurant_dish";
    imageUrl: string;
    images: string[];
    title: string;
    description: string;
    userRating: number;
    matchScore: number;
    price?: number;
    author: User;
    restaurant: Restaurant;
    stats: {
        likes: number;
        comments?: number; // Optional: number of comments on the dish
        calories: number;
        protein: number;
        fat: number;
        carbs: number;
    };
    tags: string[];
    createdAt: string;
    reviewCount?: number;
    latestPost?: any;
    isLiked?: boolean;
    isSaved?: boolean;
    status?: string;
    rejection_reason?: string;
}

// MOCK_USERS, MOCK_RESTAURANTS, MOCK_DISHES удалены — мёртвые моки (массфикс-волна).
export const CATEGORIES = [
    "Все",
    "Бургеры",
    "Суши",
    "Пицца",
    "Рамен",
    "Шаурма",
    "Хот-дог",
    "Наггетсы",
    "Bubble Tea",
    "Стейки",
    "Паста",
    "Салаты",
    "Десерты",
    "Напитки",
    "Завтраки",
    "Кофе"
];
