import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DietChips } from "./diet-chips";

const TAXONS = [
  { id: 1, slug: "vegetarian", name: "Вегетарианское" },
  { id: 2, slug: "vegan", name: "Веганское" },
  { id: 3, slug: "spicy", name: "Острое" },
  // Вид не из авторского списка: его выбирает система, а не человек.
  { id: 9, slug: "fastfood", name: "Фастфуд" },
];

describe("DietChips", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("показывает только те свойства, которые проставляет автор", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => TAXONS }));
    render(<DietChips selected={[]} onToggle={() => {}} />);

    expect(await screen.findByText("Особенности блюда")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Веганское/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Фастфуд/ })).not.toBeInTheDocument();
  });

  it("отдаёт наверх id нажатого свойства", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => TAXONS }));
    const onToggle = vi.fn();
    render(<DietChips selected={[]} onToggle={onToggle} />);

    await userEvent.click(await screen.findByRole("button", { name: /Веганское/ }));
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  it("отмеченное свойство помечено для чтения с экрана", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => TAXONS }));
    render(<DietChips selected={[2]} onToggle={() => {}} />);

    const vegan = await screen.findByRole("button", { name: /Веганское/ });
    expect(vegan).toHaveAttribute("aria-pressed", "true");
  });

  it("молчит, если справочник не ответил — создать пост это не мешает", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("нет сети")));
    const { container } = render(<DietChips selected={[]} onToggle={() => {}} />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
