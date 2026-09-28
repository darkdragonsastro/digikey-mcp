import { z } from "zod";

export const ManufacturersResponse = z.object({
  Manufacturers: z.array(z.object({ Id: z.number(), Name: z.string() })),
});

export type Manufacturer = z.infer<typeof ManufacturersResponse>["Manufacturers"][number];

const CategorySchema = z.object({
  CategoryId: z.number(),
  Name: z.string(),
  ProductCount: z.number(),
  get Children() {
    return z.array(CategorySchema).optional();
  },
});

export const CategoriesResponse = z.object({ Categories: z.array(CategorySchema) });

export type Category = z.infer<typeof CategorySchema>;

export interface CategorySummary {
  CategoryId: number;
  Name: string;
  ProductCount: number;
  ChildCount: number;
  Path?: string;
}

// Lowercase and strip accents so "wurth" matches "Würth".
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function page<T>(items: T[], offset: number, limit: number) {
  return { total: items.length, offset, limit, items: items.slice(offset, offset + limit) };
}

export function filterManufacturers(list: Manufacturer[], name: string | undefined): Manufacturer[] {
  if (!name) return list;
  const needle = normalize(name);
  return list.filter((m) => normalize(m.Name).includes(needle));
}

export function summarize(category: Category, path?: string): CategorySummary {
  const summary: CategorySummary = {
    CategoryId: category.CategoryId,
    Name: category.Name,
    ProductCount: category.ProductCount,
    ChildCount: category.Children?.length ?? 0,
  };
  if (path !== undefined) summary.Path = path;
  return summary;
}

// Depth-first list of every category with its path from the top of the tree.
function flatten(categories: Category[], parentPath = ""): { category: Category; path: string }[] {
  return categories.flatMap((category) => {
    const path = parentPath ? `${parentPath} > ${category.Name}` : category.Name;
    return [{ category, path }, ...flatten(category.Children ?? [], path)];
  });
}

function find(tree: Category[], categoryId: number): { category: Category; path: string } {
  const found = flatten(tree).find((entry) => entry.category.CategoryId === categoryId);
  if (!found) throw new Error(`Category ${categoryId} not found`);
  return found;
}

function descendants(entry: { category: Category; path: string }) {
  return flatten(entry.category.Children ?? [], entry.path);
}

export function searchCategories(tree: Category[], name: string, underId?: number): CategorySummary[] {
  const needle = normalize(name);
  const entries = underId === undefined ? flatten(tree) : descendants(find(tree, underId));
  return entries
    .filter((entry) => normalize(entry.category.Name).includes(needle))
    .map((entry) => summarize(entry.category, entry.path));
}

export function categoryChildren(tree: Category[], categoryId: number) {
  const { category, path } = find(tree, categoryId);
  return {
    category: summarize(category, path),
    children: (category.Children ?? []).map((child) => summarize(child)),
  };
}
