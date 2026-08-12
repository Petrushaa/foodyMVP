import { CatalogSearch } from "@/components/search/catalog-search";
import { fetchTaxons } from "@/lib/api/server";

export const dynamic = "force-dynamic";

/** Поиск по каталогу. Открыт гостям: каталог блюд должен индексироваться. */
export default async function SearchPage() {
  // Категории всех четырёх осей приезжают одним запросом и не меняются часто.
  const taxons = await fetchTaxons().catch(() => []);
  return <CatalogSearch taxons={taxons} />;
}
