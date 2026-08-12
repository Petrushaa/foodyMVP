import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Роуты, требующие входа (auth-редирект на /login).
const PROTECTED = [
  /^\/me(\/|$)/,
  /^\/profile(\/|$)/,
  /^\/saved$/,
  /^\/create$/,
  /^\/settings(\/|$)/,
  /^\/staff(\/|$)/,
];

// Content-Security-Policy: защита в глубину от XSS.
// - script-src: только 'self' + текущий nonce. Инъектированный инлайн-скрипт
//   без nonce НЕ выполнится, чужие хосты скриптов заблокированы.
// - object-src 'none', base-uri 'self', frame-ancestors 'none', form-action 'self'.
function buildCsp(nonce: string) {
  // В разработке React и Turbopack используют eval() для отладочных возможностей,
  // а горячая перезагрузка держит ws-соединение. Без послаблений страница падает
  // с ошибкой в консоли и не оживает. В сборке eval не используется — там строго.
  const isDev = process.env.NODE_ENV !== "production";

  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    isDev
      ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    isDev ? `connect-src 'self' ws: wss:` : `connect-src 'self'`,
    `worker-src 'self' blob:`,
    `media-src 'self' blob: data:`,
  ].join("; ");
}

export default auth((req) => {
  const { nextUrl } = req;

  // 1) Auth-редирект для защищённых роутов.
  if (PROTECTED.some((re) => re.test(nextUrl.pathname)) && !req.auth) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2) CSP с nonce для всех страниц. Nonce кладём в request-заголовок, чтобы
  //    Next автоматически проставил его своим <script>, и в response — чтобы
  //    браузер применил политику.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);
  return res;
});

export const config = {
  matcher: [
    // Все страницы, кроме статики/ассетов/прокси/next-auth.
    {
      source:
        "/((?!api|backend|_next/static|_next/image|favicon.ico|icon.png|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|woff2?)).*)",
    },
  ],
};
