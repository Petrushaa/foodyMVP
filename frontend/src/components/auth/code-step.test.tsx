import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Серверное действие ходит в сеть — подменяем до импорта компонента.
const resendEmailCode = vi.fn();
vi.mock("@/app/actions/email-codes", () => ({
  resendEmailCode: (...args: unknown[]) => resendEmailCode(...args),
}));
// GlassSurface тянет за собой оформление, к поведению отношения не имеет.
vi.mock("@/components/feed/glass-surface", () => ({
  GlassSurface: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
}));

import { CodeStep } from "./code-step";

function setup(props: Partial<React.ComponentProps<typeof CodeStep>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(null);
  const onBack = vi.fn();
  render(
    <CodeStep
      email="user@example.com"
      title="Подтвердите почту"
      submitLabel="Подтвердить"
      onSubmit={onSubmit}
      onBack={onBack}
      {...props}
    />,
  );
  return { onSubmit, onBack };
}

const codeField = () => screen.getByPlaceholderText("000000");
const submitButton = () => screen.getByRole("button", { name: /Подтвердить/ });

describe("Экран ввода кода", () => {
  beforeEach(() => {
    resendEmailCode.mockReset().mockResolvedValue({ ok: true });
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it("показывает адрес, на который ушло письмо", () => {
    setup();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
  });

  it("не даёт отправить неполный код", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onSubmit } = setup();

    await user.type(codeField(), "123");
    expect(submitButton()).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("отбрасывает всё, кроме цифр, и не пускает больше шести знаков", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup();

    // Вставка из письма может принести пробелы и лишние символы.
    await user.type(codeField(), "12ab34 56789");
    expect(codeField()).toHaveValue("123456");
  });

  it("передаёт введённый код наверх", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onSubmit } = setup();

    await user.type(codeField(), "482913");
    await user.click(submitButton());

    expect(onSubmit).toHaveBeenCalledWith("482913");
  });

  it("показывает ошибку и очищает поле, чтобы код можно было ввести заново", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSubmit = vi.fn().mockResolvedValue("Неверный или устаревший код.");
    setup({ onSubmit });

    await user.type(codeField(), "000000");
    await user.click(submitButton());

    expect(await screen.findByText("Неверный или устаревший код.")).toBeInTheDocument();
    expect(codeField()).toHaveValue("");
  });
});

describe("Повторная отправка", () => {
  beforeEach(() => {
    resendEmailCode.mockReset().mockResolvedValue({ ok: true });
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it("сначала заблокирована и показывает отсчёт", () => {
    setup();
    const button = screen.getByRole("button", { name: /Отправить ещё раз через/ });
    expect(button).toBeDisabled();
  });

  /**
   * Проматывает паузу по секунде.
   *
   * Целиком одним скачком не выходит: компонент планирует следующий тик из
   * эффекта, то есть только после перерисовки. Прокрутка по секунде даёт
   * React перерисоваться и завести следующий таймер — как в жизни.
   */
  async function waitOutCooldown() {
    for (let i = 0; i < 61; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    return screen.getByRole("button", { name: "Отправить код ещё раз" });
  }

  it("отсчёт идёт вниз и разблокирует кнопку", async () => {
    setup();
    expect(await waitOutCooldown()).toBeEnabled();
  });

  it("берёт длину паузы из ответа сервера, а не из своей константы", async () => {
    // Бэкенд знает точную паузу; своя цифра рано или поздно разойдётся с ней.
    resendEmailCode.mockResolvedValue({ error: "Письмо уже отправлено.", retryAfter: 12 });
    setup();

    const button = await waitOutCooldown();
    await act(async () => {
      fireEvent.click(button);
    });

    expect(
      screen.getByRole("button", { name: /Отправить ещё раз через 12 с/ }),
    ).toBeInTheDocument();
  });

  it("для сброса пароля шлёт своим способом, а не кодом подтверждения", async () => {
    const onResend = vi.fn().mockResolvedValue({});
    setup({ onResend });

    const button = await waitOutCooldown();
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(onResend).toHaveBeenCalled());
    expect(resendEmailCode).not.toHaveBeenCalled();
  });
});
