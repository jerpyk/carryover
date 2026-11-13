# Carryover

Move your ChatGPT chats and projects into Claude, organized.

Carryover takes ChatGPT's official data export and turns it into a **Claude migration kit**:

- 📁 Ready-to-upload files for each Claude Project, with your chats grouped the way your ChatGPT projects were
- 📝 Project instructions you can paste in, telling Claude to use your history and cite it
- 🔌 An MCP server so Claude Desktop or Claude Code can search every imported chat

Everything runs in your browser. Your export is never uploaded anywhere.

**Use it:** https://YOUR-USERNAME.github.io/carryover/

## How to use
1. In ChatGPT: **Settings → Data controls → Export data**. Download the zip from the email.
2. Open Carryover and drop in the zip (no need to unzip it).
3. Rename and organize your groups, choose which chats to keep, and download the kit.
4. Follow the in-app steps to create your Claude Projects and upload the files.

## Develop
```bash
npm install
npm test          # parser + MCP server tests
npm run build     # → dist/index.html (one self-contained page)
npm run preview   # build and serve at http://localhost:3000
```

| Path | What it is |
|---|---|
| `src/parser.js` | Reads ChatGPT exports and builds the Markdown, instructions and archive |
| `src/app.js`, `src/app.css` | The load → organize → download → import UI |
| `src/shell.html`, `src/step1-web.html` | Page template |
| `mcp-server/` | The MCP server bundled into every kit |
| `build.js` | Inlines everything into `dist/index.html` |
| `.github/workflows/deploy.yml` | Tests, builds and deploys to GitHub Pages on every push to `main` |

Carryover is an independent project, not affiliated with OpenAI or Anthropic.
