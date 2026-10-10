# Connect an AI to How I Bortey (MCP)

Your library is exposed as a **remote MCP server**. Any MCP-capable AI client can call it
with a bearer token you mint in the app.

## 1. Mint a token
In the app → **Access → Create**. Copy the token (shown once). It's a short-lived (12h)
bearer; mint a new one when it expires, or use **Log out everywhere** to revoke them all.

## 2. Endpoint
```
https://howibortey.switgh.com/mcp
```
Remote HTTP (Streamable HTTP), JSON-RPC 2.0. Tools: `search_library`, `get_entry`,
`add_entry`, `list_tags`.

## 3. Add the instruction file
Paste the contents of [`agent/how-i-bortey.md`](../agent/how-i-bortey.md) into the client's
**system prompt / custom instructions / project rules** so it knows to consult the library
before answering tool questions.

---

## Claude (Desktop / Claude Code)
Add a remote MCP server pointing at the URL with the bearer header. In Claude Desktop's
`claude_desktop_config.json`, or via a custom connector:
```json
{
  "mcpServers": {
    "how-i-bortey": {
      "url": "https://howibortey.switgh.com/mcp",
      "headers": { "Authorization": "Bearer <TOKEN>" }
    }
  }
}
```

## ChatGPT (connectors)
Settings → Connectors → **Add custom connector** → URL `https://howibortey.switgh.com/mcp`,
authentication: bearer token `<TOKEN>`. (Availability depends on your ChatGPT plan.)

## Cursor / VS Code (Copilot)
`.cursor/mcp.json` (or `.vscode/mcp.json`):
```json
{
  "mcpServers": {
    "how-i-bortey": {
      "url": "https://howibortey.switgh.com/mcp",
      "headers": { "Authorization": "Bearer <TOKEN>" }
    }
  }
}
```

## Gemini CLI
Add to `~/.gemini/settings.json`:
```json
{
  "mcpServers": {
    "how-i-bortey": {
      "httpUrl": "https://howibortey.switgh.com/mcp",
      "headers": { "Authorization": "Bearer <TOKEN>" }
    }
  }
}
```

## stdio-only clients (bridge)
Clients that only speak stdio can reach the remote server through `mcp-remote`:
```json
{
  "mcpServers": {
    "how-i-bortey": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://howibortey.switgh.com/mcp",
        "--header", "Authorization: Bearer <TOKEN>"
      ]
    }
  }
}
```

---

## 9. Verify
Ask the client: **"Search my library for photo editors."** A correct setup returns your captured
entries (e.g. *Capture One* with its alternatives). If it returns nothing, check the token
hasn't expired (mint a fresh one) and that the header is `Authorization: Bearer …`.

## 10. Revoke
The app's **Access → Log out everywhere** invalidates every token instantly.
