import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTools, type DigiKeyApi } from "../src/tools.js";
import { DigiKeyApiError } from "../src/client.js";
import { JsonFileCache } from "../src/cache.js";

async function setup() {
  const api = {
    get: vi.fn<DigiKeyApi["get"]>(async () => ({ ok: true })),
    post: vi.fn<DigiKeyApi["post"]>(async () => ({ ok: true })),
  };
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, api, new JsonFileCache(await mkdtemp(join(tmpdir(), "digikey-tools-"))));
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { api, client };
}

describe("tools", () => {
  it("search_products builds the keyword request body", async () => {
    const { api, client } = await setup();

    await client.callTool({
      name: "search_products",
      arguments: {
        keywords: "10k resistor 0603",
        limit: 5,
        offset: 10,
        manufacturerIds: ["13"],
        categoryIds: ["52"],
        searchOptions: ["InStock"],
        sortField: "Price",
        sortOrder: "Ascending",
      },
    });

    expect(api.post).toHaveBeenCalledWith("/products/v4/search/keyword", {
      Keywords: "10k resistor 0603",
      Limit: 5,
      Offset: 10,
      FilterOptionsRequest: {
        ManufacturerFilter: [{ Id: "13" }],
        CategoryFilter: [{ Id: "52" }],
        SearchOptions: ["InStock"],
      },
      SortOptions: { Field: "Price", SortOrder: "Ascending" },
    });
  });

  it("search_products sends only keywords and paging when no filters are given", async () => {
    const { api, client } = await setup();

    await client.callTool({ name: "search_products", arguments: { keywords: "LM358" } });

    expect(api.post).toHaveBeenCalledWith("/products/v4/search/keyword", {
      Keywords: "LM358",
      Limit: 10,
      Offset: 0,
    });
  });

  it("encodes part numbers in the path", async () => {
    const { api, client } = await setup();

    await client.callTool({
      name: "get_product_details",
      arguments: { productNumber: "ABC/123#X", manufacturerId: 10 },
    });

    expect(api.get).toHaveBeenCalledWith(
      "/products/v4/search/ABC%2F123%23X/productdetails?manufacturerId=10",
    );
  });

  it("get_categories picks top level, children, or search from the arguments", async () => {
    const { api, client } = await setup();
    api.get.mockResolvedValueOnce({
      Categories: [
        {
          CategoryId: 3,
          Name: "Capacitors",
          ProductCount: 10,
          Children: [
            { CategoryId: 58, Name: "Aluminum Capacitors", ProductCount: 6, Children: [] },
            { CategoryId: 60, Name: "Ceramic Capacitors", ProductCount: 4, Children: [] },
          ],
        },
        { CategoryId: 2, Name: "Resistors", ProductCount: 5, Children: [] },
      ],
    });
    const call = async (args: Record<string, unknown>) => {
      const result = await client.callTool({ name: "get_categories", arguments: args });
      const [content] = z.array(z.object({ text: z.string() })).parse(result.content);
      return JSON.parse(content.text);
    };

    expect((await call({})).categories.map((c: { Name: string }) => c.Name)).toEqual([
      "Capacitors",
      "Resistors",
    ]);
    expect((await call({ categoryId: 3, limit: 1 })).children).toEqual([
      { CategoryId: 58, Name: "Aluminum Capacitors", ProductCount: 6, ChildCount: 0 },
    ]);
    expect((await call({ name: "ceramic" })).categories[0].Path).toBe("Capacitors > Ceramic Capacitors");
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("returns API errors as tool errors", async () => {
    const { api, client } = await setup();
    api.get.mockRejectedValueOnce(
      new DigiKeyApiError(404, "DigiKey API error 404: Requested Product x Not Found", null, null),
    );

    const result = await client.callTool({
      name: "get_substitutions",
      arguments: { productNumber: "x" },
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "DigiKey API error 404: Requested Product x Not Found" },
    ]);
  });
});
