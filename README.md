# digikey-mcp

An MCP server for the DigiKey
[Product Information V4](https://developer.digikey.com/products/product-information-v4) API.
It lets an AI assistant search DigiKey parts, look up details, pricing, and
substitutes, and browse manufacturers and categories.

Prices and stock come from the DigiKey US site, in English, in USD.

## Setup

1. Create an app at [developer.digikey.com](https://developer.digikey.com) and
   subscribe it to the Product Information V4 API. Copy the app's client ID
   and client secret.
2. Add the server to your MCP client.

Claude Code:

```
claude mcp add digikey \
  --env DIGIKEY_CLIENT_ID=your-client-id \
  --env DIGIKEY_CLIENT_SECRET=your-client-secret \
  -- npx -y @darkdragonsastro/digikey-mcp
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "digikey": {
      "command": "npx",
      "args": ["-y", "@darkdragonsastro/digikey-mcp"],
      "env": {
        "DIGIKEY_CLIENT_ID": "your-client-id",
        "DIGIKEY_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

The server uses the OAuth client credentials flow. It gets a new access token
when the current one is about to expire.

## Tools

| Tool | What it does |
| --- | --- |
| `search_products` | Keyword search with manufacturer, category, and stock filters, sorting, and paging (up to 50 results per call) |
| `get_product_details` | Full details for one part: parameters, stock, pricing, datasheet, packaging |
| `get_pricing_by_quantity` | Price for a given quantity, with the best packaging options |
| `get_substitutions` | Substitute parts |
| `get_recommended_products` | Parts DigiKey recommends with this one |
| `get_product_media` | Datasheets, photos, and other documents |
| `list_manufacturers` | Find manufacturer IDs by name, with paging |
| `get_categories` | Browse the category tree or search it by name, with paging |

Part numbers can be DigiKey numbers (e.g. `P5555-ND`) or manufacturer part
numbers. If a part number matches more than one manufacturer, pass
`manufacturerId`.

## Manufacturer and category cache

DigiKey returns the full manufacturer list and category tree in one response
each (about 140 KB and 120 KB). The server saves them to
`$XDG_CACHE_HOME/digikey-mcp/` (or `~/.cache/digikey-mcp/`) and uses the saved
copy for 7 days. The tools filter and page the saved data, so only the matches
are returned to the assistant.

- Pass `refresh: true` to download a new copy right away.
- If a download fails and an older copy exists, the older copy is used and the
  result has `"stale": true` and a `warning`.
- Name filters ignore case and accents, so `wurth` finds `Würth Elektronik`.

## Rate limits

DigiKey allows 120 requests per minute and 1000 per day for Product
Information. Error messages include the number of requests left today and,
for rate limit errors, how long to wait.

## Development

```
make install   # install dependencies
make check     # typecheck, lint, and test
make build     # compile to dist/
```

To run against the live API, put your credentials in `.env` (ignored by git):

```
export DIGIKEY_CLIENT_ID=...
export DIGIKEY_CLIENT_SECRET=...
```
