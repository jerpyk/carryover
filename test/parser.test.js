const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../src/parser.js');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/conversations.json'), 'utf8'));
const convs = C.normalize(raw);

assert.strictEqual(convs.length, 5, 'empty conversation dropped');
const c1 = convs.find(c => c.id === 'c1');
assert.strictEqual(c1.messages.length, 4);
assert.ok(!JSON.stringify(convs).includes('ABANDONED'), 'abandoned branch excluded');
assert.ok(!JSON.stringify(convs).includes('I am a student'), 'custom instructions context excluded');
assert.strictEqual(c1.gizmoKind, 'project');

const c2 = convs.find(c => c.id === 'c2');
assert.strictEqual(c2.messages[0].text, '[Image]\n\nDoes this series converge?');

const c3 = convs.find(c => c.id === 'c3');
assert.strictEqual(c3.messages.length, 2, 'tool output dropped, assistant steps merged');
assert.ok(c3.messages[1].text.includes('```python\nprint(2+2)\n```'));
assert.ok(c3.messages[1].text.includes('**Canvas: piece.h**'));
assert.ok(!c3.messages[1].text.includes('\n4\n'));

const c5 = convs.find(c => c.id === 'c5');
assert.ok(!c5.messages.some(m => m.text.includes('thinking')), 'thoughts dropped');

const groups = C.initialGroups(convs);
assert.deepStrictEqual(groups.map(g => [g.name, g.convIds.length]), [
  ['ChatGPT project 1', 2], ['ChatGPT project 2', 1], ['Custom GPT 1', 1], ['Other chats', 1]
]);

// per-project export
groups[0].name = 'Calculus II';
groups[0].summary = 'Calc II homework help.';
const sel = new Set(convs.map(c => c.id));
sel.delete('c5');
let files = C.buildFiles(groups, convs, sel, { mode: 'perProject', fileStyle: 'combined' });
const paths = files.map(f => f.path);
assert.ok(paths.includes('claude-projects/01-calculus-ii/chats-part-1.md'));
assert.ok(paths.includes('claude-projects/01-calculus-ii/PROJECT_INSTRUCTIONS.md'));
assert.ok(!paths.some(p => p.includes('other-chats')), 'deselected-only group omitted');
const calc = files.find(f => f.path === 'claude-projects/01-calculus-ii/chats-part-1.md').content;
assert.ok(calc.indexOf('Calc II integration') < calc.indexOf('Series convergence'), 'oldest first');
assert.ok(files.find(f => f.path.endsWith('01-calculus-ii/PROJECT_INSTRUCTIONS.md')).content.includes('Calc II homework help.'));
const archive = JSON.parse(files.find(f => f.path === 'mcp-server/chatgpt-archive.json').content);
assert.strictEqual(archive.conversations.length, 4);
assert.strictEqual(archive.projects[0].name, 'Calculus II');

// single project, per-chat files, small chunk
files = C.buildFiles(groups, convs, new Set(convs.map(c => c.id)), { mode: 'single', singleName: 'Everything', fileStyle: 'perChat' });
assert.strictEqual(files.filter(f => f.path.includes('/chats/')).length, 5);
assert.ok(files.find(f => f.path.endsWith('INDEX.md')).content.includes('## Calculus II'));

// chunking
files = C.buildFiles(groups, convs, new Set(convs.map(c => c.id)), { mode: 'single', fileStyle: 'combined', maxChars: 300 });
assert.ok(files.filter(f => /chats-part-\d+\.md$/.test(f.path)).length >= 4);

// chat.html legacy
const html = '<script>\nvar jsonData = ' + JSON.stringify(raw) + ';\n</script>';
assert.strictEqual(C.normalize(C.extractFromChatHtml(html)).length, 5);

assert.ok(C.digestForSummary(convs).includes('Calc II integration'));
console.log('parser tests passed');

// project metadata from the extension
{
  const g2 = C.initialGroups(convs, { 'g-p-aaa111': { name: 'Calc II', description: 'Winter term', instructions: 'Explain step by step.', files: ['syllabus.pdf'] } });
  assert.strictEqual(g2[0].name, 'Calc II');
  assert.strictEqual(g2[0].namedFromSource, true);
  assert.strictEqual(g2[1].name, 'ChatGPT project 1', 'unnamed project keeps fallback numbering');
  const f2 = C.buildFiles(g2, convs, new Set(convs.map(c => c.id)), {});
  const ins = f2.find(f => f.path.endsWith('01-calc-ii/PROJECT_INSTRUCTIONS.md')).content;
  assert.ok(ins.includes('Explain step by step.') && ins.includes('Winter term'));
  assert.ok(f2.find(f => f.path.endsWith('01-calc-ii/INDEX.md')).content.includes('syllabus.pdf'));
  console.log('project metadata tests passed');
}
