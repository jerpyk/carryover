import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../src/parser.js');

const raw = JSON.parse(fs.readFileSync(new URL('./fixtures/conversations.json', import.meta.url)));
const convs = C.normalize(raw);
const groups = C.initialGroups(convs);
groups[0].name = 'Calculus II';
const files = C.buildFiles(groups, convs, new Set(convs.map(c => c.id)), {});
const archivePath = '/tmp/carryover-archive.json';
fs.writeFileSync(archivePath, files.find(f => f.path === 'mcp-server/chatgpt-archive.json').content);

const transport = new StdioClientTransport({ command: 'node', args: [process.argv[2], archivePath] });
const client = new Client({ name: 'test', version: '1' });
await client.connect(transport);
const tools = (await client.listTools()).tools.map(t => t.name).sort();
assert.deepStrictEqual(tools, ['get_conversation', 'list_conversations', 'list_projects', 'search_conversations']);
const call = async (name, args = {}) => (await client.callTool({ name, arguments: args })).content[0].text;

const projects = await call('list_projects');
assert.ok(projects.includes('Calculus II (2 chats)'), projects);
const list = await call('list_conversations', { project: 'Calculus II' });
assert.ok(list.includes('id=c1') && list.includes('id=c2') && !list.includes('id=c3'));
const search = await call('search_conversations', { query: 'ratio test' });
assert.ok(search.startsWith('1 matching') || search.includes('Series convergence'), search);
assert.ok(search.split('\n')[2].includes('Series convergence'), 'best match first');
const conv = await call('get_conversation', { id: 'c3' });
assert.ok(conv.includes('virtual legalMoves') && conv.includes('Canvas: piece.h'));
const paged = await call('get_conversation', { id: 'Chess move validation in C++', max_chars: 1000 });
assert.ok(paged.length > 0);
const missing = await client.callTool({ name: 'get_conversation', arguments: { id: 'nope' } });
assert.strictEqual(missing.isError, true);
await client.close();
console.log('MCP server tests passed');
console.log(search);
