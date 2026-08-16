import type { NextRequest } from "next/server";

import { auth } from "@/auth";

// BFF-прокси к Django. Клиент ходит на /backend/<путь> БЕЗ токена; здесь мы
// читаем httpOnly-сессию next-auth, подставляем Authorization: Bearer <token>
// и форвардим запрос на внутренний бэкенд. Так JWT доступа не покидает сервер
// (в клиентский бандл/RSC-пейлоад не попадает).
const BACKEND =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://backend:8000/api/v1";

// Заголовки, которые НЕ форвардим (hop-by-hop / служебные / небезопасные).
const SKIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "authorization", // ставим свой из сессии
  "cookie", // не проксируем куки next-auth на бэкенд
]);

async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  await ctx.params; // резолвим (значение берём из pathname, чтобы сохранить хвостовой слэш)

  const session = (await auth()) as { user?: { accessToken?: string } } | null;
  const token = session?.user?.accessToken;

  // Клиент шлёт путь БЕЗ завершающего слэша (иначе Next делает 308-редирект),
  // а Django требует завершающий слэш — добавляем его здесь.
  const rawRest = req.nextUrl.pathname
    .replace(/^\/backend\//, "")
    .replace(/\/+$/, "");
  const rest = rawRest ? `${rawRest}/` : "";
  const target = `${BACKEND}/${rest}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!SKIP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });
  if (token) headers.set("authorization", `Bearer ${token}`);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? Buffer.from(await req.arrayBuffer()) : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: body && body.byteLength ? body : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "upstream_unreachable" }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  const respHeaders = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) respHeaders.set("content-type", ct);
  const cd = upstream.headers.get("content-disposition");
  if (cd) respHeaders.set("content-disposition", cd);

  // 204, 205 и 304 не имеют тела по спецификации, и конструктор Response
  // на попытку его подставить бросает TypeError. Прокси падал с 500 там, где
  // бэкенд отвечал «всё хорошо, сказать нечего» — например на отписке.
  const withoutBody = upstream.status === 204 || upstream.status === 205
    || upstream.status === 304;

  return new Response(withoutBody ? null : await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: respHeaders,
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

export const dynamic = "force-dynamic";
