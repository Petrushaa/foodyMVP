import type { NextConfig } from "next";

/**
 * Загруженные фото и аватары отдаёт Django по /media/. В проде их перехватывает
 * Caddy и отдаёт из тома напрямую, до Next дело не доходит. А при локальном
 * запуске Caddy нет — без этого переписывания браузер стучится за картинкой
 * на порт фронта и получает 404.
 */
const backendOrigin = (
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://backend:8000/api/v1"
).replace(/\/api\/v\d+\/?$/, "");

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [{ source: "/media/:path*", destination: `${backendOrigin}/media/:path*` }];
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
