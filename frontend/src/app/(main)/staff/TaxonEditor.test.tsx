import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TaxonEditor } from "./TaxonEditor";

const TAXONS = [
  { id: 1, kind: "cuisine", slug: "chinese", name: "Китайская" },
  { id: 2, kind: "cuisine", slug: "italian", name: "Итальянская" },
  { id: 3, kind: "type", slug: "soup", name: "Супы" },
  { id: 4, kind: "type", slug: "vegan", name: "Веганское" },
  { id: 5, kind: "type", slug: "spicy", name: "Острое" },
];

function mockTaxons() {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => TAXONS }));
}

/** Группа по её заголовку — заголовок и чипы лежат в одном контейнере. */
function group(name: RegExp) {
  return screen.getByText(name).closest("div")!;
}

describe("TaxonEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("разводит виды автора и виды модератора по разным группам", async () => {
    mockTaxons();
    render(<TaxonEditor selected={[]} onChange={() => {}} />);
    await screen.findByText(/Кухня/);

    const authorGroup = group(/Со слов автора/);
    expect(within(authorGroup).getByRole("button", { name: /Веганское/ })).toBeInTheDocument();
    expect(within(authorGroup).getByRole("button", { name: /Острое/ })).toBeInTheDocument();
    expect(within(authorGroup).queryByRole("button", { name: /Супы/ })).not.toBeInTheDocument();

    const staffGroup = group(/^Вид/);
    expect(within(staffGroup).getByRole("button", { name: /Супы/ })).toBeInTheDocument();
    expect(within(staffGroup).queryByRole("button", { name: /Веганское/ })).not.toBeInTheDocument();
  });

  it("кухня одна: выбор новой снимает прежнюю", async () => {
    mockTaxons();
    const onChange = vi.fn();
    render(<TaxonEditor selected={[1, 3]} onChange={onChange} />);
    await screen.findByText(/Кухня/);

    await userEvent.click(screen.getByRole("button", { name: /Итальянская/ }));

    // Китайская ушла, вид «Супы» остался нетронутым.
    expect(onChange).toHaveBeenCalledWith([3, 2]);
  });

  it("повторное нажатие по кухне снимает её", async () => {
    mockTaxons();
    const onChange = vi.fn();
    render(<TaxonEditor selected={[1]} onChange={onChange} />);
    await screen.findByText(/Кухня/);

    await userEvent.click(screen.getByRole("button", { name: /Китайская/ }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("видов можно набрать сколько нужно", async () => {
    mockTaxons();
    const onChange = vi.fn();
    render(<TaxonEditor selected={[3]} onChange={onChange} />);
    await screen.findByText(/Кухня/);

    await userEvent.click(screen.getByRole("button", { name: /Веганское/ }));

    expect(onChange).toHaveBeenCalledWith([3, 4]);
  });

  it("не молчит, если справочник не ответил — иначе категории нечем проставить", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("нет сети")));
    render(<TaxonEditor selected={[]} onChange={() => {}} />);

    expect(await screen.findByText(/не загрузился/)).toBeInTheDocument();
  });
});
