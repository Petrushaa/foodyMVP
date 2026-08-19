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

/**
 * Ошибка запроса к бэкенду, сохраняющая HTTP-статус и тело ответа.
 *
 * Раньше `apiRequest` бросал обычный Error с одним лишь текстом, и отличить
 * 400 от 429 было нельзя. Из-за этого рядом появились два самодельных
 * клиента — в модерации и в почтовых действиях, — каждый со своим разбором
 * ответа. Статус нужен вызывающему: на 429 показывают отсчёт, на 403 ведут на
 * ввод кода, на 401 отправляют на вход.
 */
export class ApiError extends Error {
  /** HTTP-статус. Ноль означает, что до сервера не достучались. */
  readonly status: number;
  /** Разобранное тело ответа — там лежат ошибки по полям формы. */
  readonly data: unknown;

  constructor(status: number, data: unknown, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}
