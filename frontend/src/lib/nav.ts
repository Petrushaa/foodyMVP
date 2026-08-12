import { Bookmark, Plus, Rows3, Search, User, type LucideIcon } from "lucide-react";

export type NavId = "feed" | "search" | "add" | "saved" | "me";

export type NavItem = {
  id: NavId;
  label: string;
  icon: LucideIcon;
  href: string;
  /** Акцентный пункт «Создать пост». */
  primary?: boolean;
};

// Единый источник пунктов навигации — используется и нижним баром (мобайл),
// и левым сайдбаром (десктоп), чтобы они не расходились.
export const NAV_ITEMS: NavItem[] = [
  { id: "feed", label: "Лента", icon: Rows3, href: "/" },
  { id: "search", label: "Поиск", icon: Search, href: "/search" },
  { id: "add", label: "Создать пост", icon: Plus, primary: true, href: "/create" },
  { id: "saved", label: "Избранное", icon: Bookmark, href: "/saved" },
  { id: "me", label: "Профиль", icon: User, href: "/me" },
];

// Активен ли пункт для текущего пути.
// «/» — только точное совпадение; «Профиль» матчит /me/* и алиасы /profile*.
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  if (item.id === "me") {
    return (
      pathname === "/me" ||
      pathname.startsWith("/me/") ||
      pathname === "/profile" ||
      pathname.startsWith("/profile/")
    );
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
