#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TokenProvider } from "./auth.js";
import { defaultCacheDir, JsonFileCache } from "./cache.js";
import { DigiKeyClient } from "./client.js";
import { registerTools } from "./tools.js";

const clientId = process.env.DIGIKEY_CLIENT_ID;
const clientSecret = process.env.DIGIKEY_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("DIGIKEY_CLIENT_ID and DIGIKEY_CLIENT_SECRET must be set.");
  process.exit(1);
}

const server = new McpServer({ name: "digikey-mcp", version: "0.1.0" });
registerTools(
  server,
  new DigiKeyClient(clientId, new TokenProvider(clientId, clientSecret)),
  new JsonFileCache(defaultCacheDir()),
);

await server.connect(new StdioServerTransport());
console.error("digikey-mcp running on stdio");
