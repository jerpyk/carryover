#!/usr/bin/env node
// ChatGPT archive MCP server: lets Claude search and read your imported ChatGPT history.
// Archive path: first CLI argument, else $CHATGPT_ARCHIVE, else ./chatgpt-archive.json next to this file.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const archivePath = path.resolve(process.argv[2] || process.env.CHATGPT_ARCHIVE || path.join(here, 'chatgpt-archive.json'));

let archive;
try {
  archive = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
  if (archive.format !== 'carryover-archive') throw new Error('not a Carryover archive');
} catch (e) {
  console.error(`[chatgpt-archive] Could not load ${archivePath}: ${e.message}`);
  process.exit(1);
}

const convs = archive.conversations;
const byId = new Map(convs.map(c => [c.id, c]));
const lower = new Map(convs.map(c => [c.id, (c.title + '\n' + c.messages.map(m => m.text).join('\n')).toLowerCase()]));
const day = iso => (iso ? iso.slice(0, 10) : '?');
const text = s => ({ content: [{ type: 'text', text: s }] });
const projectMatch = (c, p) => !p || c.project.toLowerCase() === p.toLowerCase();

function transcript(c) {
  return [`# ${c.title}`, `Project: ${c.project} · started ${day(c.created)} · updated ${day(c.updated)} · id ${c.id}`, '',
    ...c.messages.map(m => `## ${m.role === 'user' ? 'User' : 'ChatGPT'}${m.time ? ' (' + m.time.slice(0, 16).replace('T', ' ') + ' UTC)' : ''}\n\n${m.text}\n`)
  ].join('\n');
}

const server = new McpServer({ name: 'chatgpt-archive', version: '1.0.0' });

server.registerTool('list_projects', {
  title: 'List imported ChatGPT projects',
  description: 'List the projects (groups) in the imported ChatGPT history with chat counts and summaries. Start here to see what the archive covers.',
  inputSchema: {}
}, async () => text(archive.projects.map(p =>
  `- ${p.name} (${p.conversationCount} chats)${p.summary ? ': ' + p.summary.replace(/\s+/g, ' ') : ''}`).join('\n') +
  `\n\nArchive generated ${day(archive.generated)}, ${convs.length} conversations total.`));

server.registerTool('list_conversations', {
  title: 'List ChatGPT conversations',
  description: 'List imported ChatGPT conversations (newest first), optionally only those in one project. Returns ids for get_conversation.',
  inputSchema: {
    project: z.string().optional().describe('Exact project name from list_projects'),
    limit: z.number().int().min(1).max(200).optional().describe('Default 50'),
    offset: z.number().int().min(0).optional()
  }
}, async ({ project, limit = 50, offset = 0 }) => {
  const list = convs.filter(c => projectMatch(c, project))
    .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  const page = list.slice(offset, offset + limit);
  if (!page.length) return text(project ? `No conversations found in project "${project}".` : 'No conversations.');
  return text(page.map(c => `- [${day(c.updated)}] ${c.title} (${c.messages.length} msgs, ${c.project}) id=${c.id}`).join('\n') +
    (offset + limit < list.length ? `\n\n${list.length - offset - limit} more: call again with offset=${offset + limit}.` : ''));
});

server.registerTool('search_conversations', {
  title: 'Search ChatGPT history',
  description: 'Keyword search across titles and message text of the imported ChatGPT history. Returns matching conversations with snippets and ids.',
  inputSchema: {
    query: z.string().min(1).describe('Words to look for; results rank by how many distinct words match'),
    project: z.string().optional().describe('Restrict to one project name'),
    limit: z.number().int().min(1).max(50).optional().describe('Default 10')
  }
}, async ({ query, project, limit = 10 }) => {
  const terms = [...new Set(query.toLowerCase().split(/\s+/).filter(t => t.length > 1))];
  if (!terms.length) return text('Query too short.');
  // Match at the start of a word, so "ratio" does not hit "integration".
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const res = terms.map(t => new RegExp('(?<![\\p{L}\\p{N}])' + esc(t), 'gu'));
  const hits = [];
  for (const c of convs) {
    if (!projectMatch(c, project)) continue;
    const hay = lower.get(c.id);
    const title = c.title.toLowerCase();
    let distinct = 0, freq = 0, pos = Infinity;
    for (const re of res) {
      re.lastIndex = 0;
      let m, k = 0;
      while ((m = re.exec(hay)) && k < 50) { if (!k) pos = Math.min(pos, m.index); k++; }
      if (k) distinct++;
      re.lastIndex = 0;
      freq += k + (re.test(title) ? 5 : 0);
    }
    if (distinct) hits.push({ c, pos, score: distinct * 100 + freq });
  }
  hits.sort((a, b) => b.score - a.score);
  if (!hits.length) return text(`No matches for "${query}".`);
  const out = hits.slice(0, limit).map(({ c, pos }) => {
    const full = c.title + '\n' + c.messages.map(m => m.text).join('\n');
    const snip = full.slice(Math.max(0, pos - 120), pos + 200).replace(/\s+/g, ' ').trim();
    return `- ${c.title} [${day(c.created)}, ${c.project}] id=${c.id}\n  …${snip}…`;
  });
  return text(`${hits.length} matching conversations${hits.length > limit ? ` (showing ${limit})` : ''}:\n\n${out.join('\n')}`);
});

server.registerTool('get_conversation', {
  title: 'Read a ChatGPT conversation',
  description: 'Return the full transcript of one imported ChatGPT conversation by id (or exact title). Long chats are paged with offset.',
  inputSchema: {
    id: z.string().describe('Conversation id from search/list, or its exact title'),
    offset: z.number().int().min(0).optional().describe('Character offset for long transcripts'),
    max_chars: z.number().int().min(1000).max(200000).optional().describe('Default 40000')
  }
}, async ({ id, offset = 0, max_chars = 40000 }) => {
  const c = byId.get(id) || convs.find(x => x.title.toLowerCase() === id.toLowerCase());
  if (!c) return { ...text(`No conversation with id or title "${id}". Use search_conversations to find it.`), isError: true };
  const full = transcript(c);
  const part = full.slice(offset, offset + max_chars);
  const more = offset + max_chars < full.length ? `\n\n[Truncated: ${full.length - offset - max_chars} more characters. Call again with offset=${offset + max_chars}.]` : '';
  return text(part + more);
});

await server.connect(new StdioServerTransport());
console.error(`[chatgpt-archive] Serving ${convs.length} conversations from ${archivePath}`);
