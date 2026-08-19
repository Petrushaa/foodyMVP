import { describe, expect, it } from "vitest";

import { ApiError, explainApiError } from "./api-errors";

describe("Разбор ответа DRF об ошибке", () => {
  it("берёт detail, когда ошибка общая", () => {
    expect(explainApiError({ detail: "Неверный или устаревший код." }))
      .toBe("Неверный или устаревший код.");
  });

  it("берёт первый текст, когда ошибка привязана к полю", () => {
    // Django отдаёт ошибки полей списками: {"email": ["уже занят"]}.
    expect(explainApiError({ email: ["Пользователь с таким email уже существует."] }))
      .toBe("Пользователь с таким email уже существует.");
  });

  it("не спотыкается о пустоту и мусор", () => {
    expect(explainApiError(null, "запасной")).toBe("запасной");
    expect(explainApiError("строка", "запасной")).toBe("запасной");
    expect(explainApiError({}, "запасной")).toBe("запасной");
    expect(explainApiError({ ошибка: 42 }, "запасной")).toBe("запасной");
  });
});

describe("ApiError", () => {
  it("несёт статус и тело ответа", () => {
    // Ради этого класс и заведён: по одному тексту нельзя было отличить
    // 429 (показать отсчёт) от 400 (показать «неверный код»).
    const error = new ApiError(429, { retry_after: 12 }, "Письмо уже отправлено.");

    expect(error.status).toBe(429);
    expect(error.data).toEqual({ retry_after: 12 });
    expect(error.message).toBe("Письмо уже отправлено.");
    expect(error).toBeInstanceOf(Error);
  });
});
