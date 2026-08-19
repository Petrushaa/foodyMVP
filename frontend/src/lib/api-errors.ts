/**
 * Разбор ответов DRF об ошибке.
 *
 * Django отвечает то `{"detail": "текст"}`, то `{"поле": ["текст"]}` — форма
 * зависит от того, где именно сработала проверка. Показывать человеку
 * «Ошибка 400» вместо готового объяснения незачем, а разбирать эти два вида в
 * каждом месте вызова — значит однажды забыть про один из них.
 */
export function explainApiError(data: unknown, fallback = ""): string {
  if (!data || typeof data !== "object") return fallback;

  const payload = data as Record<string, unknown>;
  if (typeof payload.detail === "string") return payload.detail;

  const first = Object.values(payload)[0];
  if (Array.isArray(first) && typeof first[0] === "string") return first[0];
  return typeof first === "string" ? first : fallback;
}
