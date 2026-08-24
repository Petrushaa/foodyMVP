import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SortControl } from "./sort-control";

const push = vi.fn();
let params = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/search/results",
  useSearchParams: () => params,
}));

function setUrl(query: string) {
  params = new URLSearchParams(query);
}

describe("SortControl", () => {
  beforeEach(() => {
    push.mockClear();
    setUrl("");
  });

  it("прячет варианты за кнопкой, а не занимает ими экран", () => {
    render(<SortControl hasQuery={false} />);

    expect(screen.getByRole("button", { name: "Сортировка" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Сначала дешёвые" })).not.toBeInTheDocument();
  });

  it("предлагает порядок по цене, отзывам, рейтингу и новизне", async () => {
    render(<SortControl hasQuery={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Сортировка" }));

    for (const label of [
      "Сначала лучшие",
      "Сначала дешёвые",
      "Сначала дорогие",
      "Больше отзывов",
      "Новые",
    ]) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    }
  });

  it("выбор порядка дописывается в адрес", async () => {
    setUrl("cuisine=chinese");
    render(<SortControl hasQuery={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Сортировка" }));
    await userEvent.click(screen.getByRole("radio", { name: "Сначала дешёвые" }));

    // Фильтр по кухне при этом сохраняется: порядок его не отменяет.
    expect(push).toHaveBeenCalledWith("/search/results?cuisine=chinese&sort=price");
  });

  it("возврат к порядку по умолчанию убирает параметр, а не шлёт пустой", async () => {
    setUrl("sort=price");
    render(<SortControl hasQuery={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Сортировка: Сначала дешёвые" }));
    await userEvent.click(screen.getByRole("radio", { name: "Сначала лучшие" }));

    expect(push).toHaveBeenCalledWith("/search/results");
  });

  it("кнопка показывает выбранный порядок, не открывая шторку", () => {
    setUrl("sort=reviews");
    render(<SortControl hasQuery={false} />);

    // Название прямо на кнопке — иначе выбранный порядок не виден, пока не
    // откроешь список.
    expect(screen.getByRole("button", { name: "Сортировка: Больше отзывов" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сбросить порядок" })).toBeInTheDocument();
  });

  it("выбранный вариант помечен для чтения с экрана", async () => {
    setUrl("sort=reviews");
    render(<SortControl hasQuery={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Сортировка: Больше отзывов" }));

    expect(screen.getByRole("radio", { name: "Больше отзывов" }))
      .toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Сначала дорогие" }))
      .toHaveAttribute("aria-checked", "false");
  });

  it("мусор в адресе показывается как порядок по умолчанию", () => {
    // Бэкенд неизвестное значение игнорирует — кнопка не должна утверждать
    // обратное.
    setUrl("sort=капуста");
    render(<SortControl hasQuery={false} />);

    expect(screen.getByRole("button", { name: "Сортировка" })).toBeInTheDocument();
  });

  it("при текстовом поиске порядок по умолчанию называется честно", async () => {
    render(<SortControl hasQuery />);
    await userEvent.click(screen.getByRole("button", { name: "Сортировка" }));

    // На «шаурма» сверху окажется самая похожая по названию, а не самая
    // вкусная — называть это «сначала лучшие» было бы враньём.
    expect(screen.getByRole("radio", { name: "Сначала похожие" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Сначала лучшие" })).not.toBeInTheDocument();
    // Зато рейтинг становится отдельным выбором.
    expect(screen.getByRole("radio", { name: "По рейтингу" })).toBeInTheDocument();
  });

  it("по рейтингу при текстовом поиске просит сортировку явно", async () => {
    render(<SortControl hasQuery />);
    await userEvent.click(screen.getByRole("button", { name: "Сортировка" }));
    await userEvent.click(screen.getByRole("radio", { name: "По рейтингу" }));

    expect(push).toHaveBeenCalledWith("/search/results?sort=rating");
  });
});
