import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { JsonFileCache } from "./cache.js";
import {
  categoryChildren,
  filterManufacturers,
  page,
  searchCategories,
  summarize,
  CategoriesResponse,
  ManufacturersResponse,
} from "./lookup.js";

const SEARCH = "/products/v4/search";

export interface DigiKeyApi {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
}

const productNumber = z
  .string()
  .min(1)
  .describe("DigiKey product number (e.g. P5555-ND) or manufacturer part number");

const manufacturerId = z
  .number()
  .int()
  .optional()
  .describe(
    "Manufacturer ID, used when a part number matches more than one manufacturer (e.g. CR2032). Find IDs with list_manufacturers.",
  );

const readOnly = { readOnlyHint: true, openWorldHint: true };

function productPath(part: string, suffix: string, query: Record<string, unknown> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return `${SEARCH}/${encodeURIComponent(part)}/${suffix}${qs ? `?${qs}` : ""}`;
}

async function run(call: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await call()) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

export function registerTools(server: McpServer, api: DigiKeyApi, cache: JsonFileCache): void {
  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description:
        "Search DigiKey products by keyword, with optional filters and sorting. Returns standard (list) pricing, stock, and parameters for each match.",
      inputSchema: {
        keywords: z.string().min(1).max(250).describe("Search keywords, up to 250 characters"),
        limit: z.number().int().min(1).max(50).default(10).describe("Results to return, 1 to 50"),
        offset: z.number().int().min(0).default(0).describe("Index of the first result, for paging"),
        manufacturerIds: z
          .array(z.string())
          .optional()
          .describe("Only include these manufacturer IDs (see list_manufacturers)"),
        categoryIds: z
          .array(z.string())
          .optional()
          .describe("Only include these category IDs (see get_categories)"),
        searchOptions: z
          .array(
            z.enum([
              "ChipOutpost",
              "Has3DModel",
              "HasCadModel",
              "HasDatasheet",
              "HasProductPhoto",
              "InStock",
              "NewProduct",
              "NonRohsCompliant",
              "NormallyStocking",
              "RohsCompliant",
            ]),
          )
          .optional()
          .describe("Extra filters, e.g. InStock"),
        sortField: z
          .enum([
            "None",
            "Packaging",
            "ProductStatus",
            "DigiKeyProductNumber",
            "ManufacturerProductNumber",
            "Manufacturer",
            "MinimumQuantity",
            "QuantityAvailable",
            "Price",
            "Supplier",
            "PriceManufacturerStandardPackage",
          ])
          .optional(),
        sortOrder: z.enum(["Ascending", "Descending"]).optional(),
      },
      annotations: readOnly,
    },
    (args) => {
      const filters: Record<string, unknown> = {};
      if (args.manufacturerIds?.length) {
        filters.ManufacturerFilter = args.manufacturerIds.map((Id) => ({ Id }));
      }
      if (args.categoryIds?.length) {
        filters.CategoryFilter = args.categoryIds.map((Id) => ({ Id }));
      }
      if (args.searchOptions?.length) {
        filters.SearchOptions = args.searchOptions;
      }
      const body: Record<string, unknown> = {
        Keywords: args.keywords,
        Limit: args.limit,
        Offset: args.offset,
      };
      if (Object.keys(filters).length) body.FilterOptionsRequest = filters;
      if (args.sortField) {
        body.SortOptions = { Field: args.sortField, SortOrder: args.sortOrder ?? "Ascending" };
      }
      return run(() => api.post(`${SEARCH}/keyword`, body));
    },
  );

  server.registerTool(
    "get_product_details",
    {
      title: "Get product details",
      description:
        "Get full details for one product: description, parameters, stock, pricing, datasheet, and packaging variations.",
      inputSchema: { productNumber, manufacturerId },
      annotations: readOnly,
    },
    (args) =>
      run(() =>
        api.get(
          productPath(args.productNumber, "productdetails", {
            manufacturerId: args.manufacturerId,
          }),
        ),
      ),
  );

  server.registerTool(
    "get_pricing_by_quantity",
    {
      title: "Get pricing by quantity",
      description:
        "Get the price for buying a given quantity of a product, including the best packaging options for that quantity.",
      inputSchema: {
        productNumber,
        quantity: z.number().int().min(1).describe("Quantity to price"),
        manufacturerId,
      },
      annotations: readOnly,
    },
    (args) =>
      run(() =>
        api.get(
          productPath(args.productNumber, `pricingbyquantity/${args.quantity}`, {
            manufacturerId: args.manufacturerId,
          }),
        ),
      ),
  );

  server.registerTool(
    "get_substitutions",
    {
      title: "Get substitutions",
      description: "Get substitute products for a product.",
      inputSchema: { productNumber },
      annotations: readOnly,
    },
    (args) => run(() => api.get(productPath(args.productNumber, "substitutions"))),
  );

  server.registerTool(
    "get_recommended_products",
    {
      title: "Get recommended products",
      description: "Get products that DigiKey recommends alongside a product.",
      inputSchema: {
        productNumber,
        limit: z.number().int().min(1).optional().describe("Number of recommendations (DigiKey default is 1)"),
        excludeMarketplace: z.boolean().optional().describe("Leave out Marketplace (third-party) products"),
      },
      annotations: readOnly,
    },
    (args) =>
      run(() =>
        api.get(
          productPath(args.productNumber, "recommendedproducts", {
            limit: args.limit,
            excludeMarketPlaceProducts: args.excludeMarketplace,
          }),
        ),
      ),
  );

  server.registerTool(
    "get_product_media",
    {
      title: "Get product media",
      description: "Get media links for a product: datasheets, photos, videos, and other documents.",
      inputSchema: { productNumber },
      annotations: readOnly,
    },
    (args) => run(() => api.get(productPath(args.productNumber, "media"))),
  );

  const refresh = z
    .boolean()
    .optional()
    .describe("Download a new copy from DigiKey instead of using the saved copy (saved copies are kept for 7 days)");
  const offset = z.number().int().min(0).default(0).describe("Index of the first result, for paging");
  const limit = z.number().int().min(1).max(500).default(50).describe("Results to return, 1 to 500");

  const manufacturers = (options: { refresh?: boolean }) =>
    cache.get(
      "manufacturers",
      async () => {
        const body = await api.get(`${SEARCH}/manufacturers`);
        return ManufacturersResponse.parse(body).Manufacturers;
      },
      options,
    );

  const categories = (options: { refresh?: boolean }) =>
    cache.get(
      "categories",
      async () => {
        const body = await api.get(`${SEARCH}/categories`);
        return CategoriesResponse.parse(body).Categories;
      },
      options,
    );

  server.registerTool(
    "list_manufacturers",
    {
      title: "List manufacturers",
      description:
        "Find manufacturers and their IDs. IDs can be used as search_products filters and as manufacturerId. The name filter ignores case and accents.",
      inputSchema: {
        name: z.string().optional().describe("Only include manufacturers whose name contains this text"),
        offset,
        limit,
        refresh,
      },
      annotations: readOnly,
    },
    (args) =>
      run(async () => {
        const { data, ...cacheInfo } = await manufacturers({ refresh: args.refresh });
        const { items, ...paging } = page(filterManufacturers(data, args.name), args.offset, args.limit);
        return { ...paging, manufacturers: items, ...cacheInfo };
      }),
  );

  server.registerTool(
    "get_categories",
    {
      title: "Get categories",
      description:
        "Browse or search DigiKey product categories. With no arguments, returns the top-level categories. With categoryId, returns that category and its direct children. With name, searches all categories (or only those under categoryId) and returns each match with its full path. Category IDs can be used as search_products filters.",
      inputSchema: {
        categoryId: z.number().int().optional().describe("Category to list children of, or to search under"),
        name: z.string().optional().describe("Only include categories whose name contains this text"),
        offset,
        limit,
        refresh,
      },
      annotations: readOnly,
    },
    (args) =>
      run(async () => {
        const { data, ...cacheInfo } = await categories({ refresh: args.refresh });
        if (args.name) {
          const { items, ...paging } = page(searchCategories(data, args.name, args.categoryId), args.offset, args.limit);
          return { ...paging, categories: items, ...cacheInfo };
        }
        if (args.categoryId !== undefined) {
          const { category, children } = categoryChildren(data, args.categoryId);
          const { items, ...paging } = page(children, args.offset, args.limit);
          return { category, ...paging, children: items, ...cacheInfo };
        }
        const { items, ...paging } = page(data.map((c) => summarize(c)), args.offset, args.limit);
        return { ...paging, categories: items, ...cacheInfo };
      }),
  );
}
