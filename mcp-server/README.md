# ChatGPT archive MCP server

Gives Claude four tools over your imported ChatGPT history: `list_projects`, `list_conversations`, `search_conversations` and `get_conversation`. Everything stays on your computer; the server just reads `chatgpt-archive.json` in this folder.

Works with **Claude Desktop** and **Claude Code** (local MCP servers). Needs Node.js 18 or newer: https://nodejs.org

## 1. Install (once)

Open a terminal in this folder and run:

```
npm install
```

## 2a. Claude Desktop

Settings → Developer → Edit Config, then add this inside `claude_desktop_config.json` (use the full path to this folder):

```json
{
  "mcpServers": {
    "chatgpt-archive": {
      "command": "node",
      "args": ["/FULL/PATH/TO/mcp-server/server.js"]
    }
  }
}
```

On Windows, write the path with double backslashes, e.g. `"C:\\Users\\you\\Downloads\\carryover\\mcp-server\\server.js"`. Restart Claude Desktop fully afterwards.

## 2b. Claude Code

```
claude mcp add chatgpt-archive -- node /FULL/PATH/TO/mcp-server/server.js
```

## 3. Try it

Ask Claude: *"Use my ChatGPT archive. What did I work on in my Calculus project?"* or *"Search my ChatGPT history for the chess move validation discussion."*

To use a different archive file: `node server.js /path/to/chatgpt-archive.json` (or set `CHATGPT_ARCHIVE`).
