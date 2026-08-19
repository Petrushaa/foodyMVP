import type { NextConfig } from "next";

/**
 * Проксирование к Django при локальном запуске.
 *
 * В проде и то и другое перехватывает Caddy, до Next дело не доходит. А без
 * него браузер стучится на порт фронта и получает 404:
 *
 *   /media/  — загруженные фото и аватары;
 *   /api/v1/ — справочники, которые экран категорий грузит уже в браузере.
 *              Из-за этого 404 список блюд молча подменялся захардкоженным
 *              запасным, и ни новых блюд, ни разбиения по группам не было
 *              видно — при том что бэкенд отдавал всё правильно.
 *
 * `/api/auth/` не задет: это NextAuth, он живёт во фронте и остаётся здесь.
 */
const backendOrigin = (
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://backend:8000/api/v1"
).replace(/\/api\/v\d+\/?$/, "");

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      { source: "/media/:path*", destination: `${backendOrigin}/media/:path*` },
      // Слэш в конце обязателен: Next нормализацией его срезает, а Django с
      // APPEND_SLASH возвращает обратно — без этого путь зацикливался на
      // редиректах и до бэкенда не доходил вовсе.
      { source: "/api/v1/:path*", destination: `${backendOrigin}/api/v1/:path*/` },
    ];
  },
  async redirects() {
    // Профиль живёт по /me. Старый адрес оставляем для ссылок и закладок, но
    // отвечаем обычным редиректом: серверный компонент, который сразу делает
    // redirect(), React пытается замерить и ругается «negative time stamp».
    return [{ source: "/profile", destination: "/me", permanent: false }];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "storage.yandexcloud.net",
      },
      {
        protocol: "https",
        hostname: "api.dicebear.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "http",
        hostname: "backend",
      },
    ],
    unoptimized: true,
  },
};

export default nextConfig;
