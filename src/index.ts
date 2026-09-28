#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
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

// release-please bumps the version in package.json, so read it from there.
const { version } = z
  .object({ version: z.string() })
  .parse(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")));

const server = new McpServer({ name: "digikey-mcp", version });
registerTools(
  server,
  new DigiKeyClient(clientId, new TokenProvider(clientId, clientSecret)),
  new JsonFileCache(defaultCacheDir()),
);

await server.connect(new StdioServerTransport());
console.error("digikey-mcp running on stdio");
