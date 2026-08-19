import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "./api";
import { ApiError } from "./api-errors";

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error("не JSON");
      return body;
    },
  } as Response;
}

describe("apiRequest", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("возвращает разобранный ответ", async () => {
    vi.mocked(fetch).mockResolvedValue(reply(200, { id: 7 }));
    await expect(apiRequest("/posts/")).resolves.toEqual({ id: 7 });
  });

  it("на 204 возвращает null, а не падает на пустом теле", async () => {
    vi.mocked(fetch).mockResolvedValue(reply(204, undefined));
    await expect(apiRequest("/posts/1/save/", { method: "DELETE" })).resolves.toBeNull();
  });

  it("сохраняет статус и тело ответа в ошибке", async () => {
    // Ради этого всё и затевалось: по одному тексту нельзя было отличить
    // 429 (показать отсчёт) от 400 (показать «неверный код»).
    vi.mocked(fetch).mockResolvedValue(
      reply(429, { detail: "Письмо уже отправлено.", retry_after: 12 }),
    );

    const error = await apiRequest("/users/email/resend/").catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(429);
    expect((error.data as any).retry_after).toBe(12);
    expect(error.message).toBe("Письмо уже отправлено.");
  });

  it("отдаёт ошибки по полям формы нетронутыми", async () => {
    vi.mocked(fetch).mockResolvedValue(
      reply(400, { email: ["Пользователь с таким email уже существует."] }),
    );

    const error = await apiRequest("/users/register/", { method: "POST" }).catch((e) => e);

    expect(error.status).toBe(400);
    // Форма регистрации подписывает поля по ключам — ей нужен весь объект.
    expect(error.data).toEqual({
      email: ["Пользователь с таким email уже существует."],
    });
  });

  it("на 401 оставляет прежний текст UNAUTHORIZED", async () => {
    // По этому тексту полдюжины страниц отправляют человека на вход.
    // Смена формулировки тихо сломала бы их все.
    vi.mocked(fetch).mockResolvedValue(reply(401, { detail: "Учётные данные не были предоставлены." }));

    const error = await apiRequest("/users/me/").catch((e) => e);

    expect(error.message).toBe("UNAUTHORIZED");
    expect(error.status).toBe(401);
  });

  it("отличает недоступный сервер от любого его ответа", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("fetch failed"));

    const error = await apiRequest("/posts/").catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
  });
});
