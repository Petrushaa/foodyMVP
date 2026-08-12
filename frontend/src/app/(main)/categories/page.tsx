import { CategorySelectionScreen } from "@/components/categories/category-selection-screen";
import { fetchCategories } from "@/lib/categories";
import { DEFAULT_TWEAKS } from "@/lib/mock-data";

type CategoriesPageProps = {
  searchParams: Promise<{
    source?: string | string[];
  }>;
};

function getSource(value: string | string[] | undefined) {
  const source = Array.isArray(value) ? value[0] : value;
  return source === "review" ? "review" : "search";
}

export default async function CategoriesPage({
  searchParams,
}: CategoriesPageProps) {
  const [params, apiCategories] = await Promise.all([
    searchParams,
    fetchCategories(),
  ]);

  return (
    <CategorySelectionScreen
      brand={DEFAULT_TWEAKS.brand}
      palette={DEFAULT_TWEAKS.palette}
      source={getSource(params.source)}
      apiCategories={apiCategories}
    />
  );
}
