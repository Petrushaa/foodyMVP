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

  it("предлагает порядок по цене, отзывам, рейтингу и новизне", () => {
    render(<SortControl hasQuery={false} />);

    for (const label of [
      "Сначала лучшие",
      "Сначала дешёвые",
      "Сначала дорогие",
      "Больше отзывов",
      "Новые",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("выбор порядка дописывается в адрес", async () => {
    setUrl("cuisine=chinese");
    render(<SortControl hasQuery={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Сначала дешёвые" }));

    // Фильтр по кухне при этом сохраняется: порядок его не отменяет.
    expect(push).toHaveBeenCalledWith("/search/results?cuisine=chinese&sort=price");
  });

  it("возврат к порядку по умолчанию убирает параметр, а не шлёт пустой", async () => {
    setUrl("sort=price");
    render(<SortControl hasQuery={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Сначала лучшие" }));

    expect(push).toHaveBeenCalledWith("/search/results");
  });

  it("выбранный порядок помечен для чтения с экрана", () => {
    setUrl("sort=reviews");
    render(<SortControl hasQuery={false} />);

    expect(screen.getByRole("button", { name: "Больше отзывов" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Сначала дорогие" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("при текстовом поиске порядок по умолчанию называется честно", () => {
    render(<SortControl hasQuery />);

    // На «шаурма» сверху окажется самая похожая по названию, а не самая
    // вкусная — называть это «сначала лучшие» было бы враньём.
    expect(screen.getByRole("button", { name: "Сначала похожие" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Сначала лучшие" })).not.toBeInTheDocument();
    // Зато рейтинг становится отдельным выбором.
    expect(screen.getByRole("button", { name: "По рейтингу" })).toBeInTheDocument();
  });

  it("по рейтингу при текстовом поиске просит сортировку явно", async () => {
    render(<SortControl hasQuery />);

    await userEvent.click(screen.getByRole("button", { name: "По рейтингу" }));

    expect(push).toHaveBeenCalledWith("/search/results?sort=rating");
  });
});
