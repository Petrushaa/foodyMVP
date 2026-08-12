import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Роуты, требующие входа (auth-редирект на /login).
const PROTECTED = [
  // Свой профиль и его редактирование — только для вошедших. Чужие профили
  // (/profile/<id>) открыты гостям: по таким ссылкам и делятся.
  /^\/profile$/,
  /^\/profile\/edit$/,
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
  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
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
