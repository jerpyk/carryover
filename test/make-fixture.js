// Builds a fake ChatGPT export that mimics the real conversations.json structure.
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

let n = 0;
const nid = () => 'node-' + (++n);

function conv({ id, title, t, gizmo, turns, branch }) {
  const mapping = {};
  const root = nid();
  mapping[root] = { id: root, message: null, parent: null, children: [] };
  const sys = nid();
  mapping[sys] = { id: sys, parent: root, children: [], message: { author: { role: 'system' }, content: { content_type: 'text', parts: [''] }, create_time: t, metadata: { is_visually_hidden_from_conversation: true } } };
  mapping[root].children.push(sys);
  const ctx = nid();
  mapping[ctx] = { id: ctx, parent: sys, children: [], message: { author: { role: 'user' }, content: { content_type: 'user_editable_context', user_profile: 'I am a student', user_instructions: '' }, create_time: t, metadata: { is_visually_hidden_from_conversation: true } } };
  mapping[sys].children.push(ctx);
  let parent = ctx;
  let time = t;
  for (const turn of turns) {
    const id2 = nid();
    time += 30;
    mapping[id2] = { id: id2, parent, children: [], message: { author: { role: turn.role }, recipient: turn.recipient || 'all', content: turn.content, create_time: time, metadata: turn.metadata || {} } };
    mapping[parent].children.push(id2);
    parent = id2;
  }
  if (branch) {
    // An abandoned edit branch hanging off the first user message: must NOT appear.
    const firstUser = mapping[ctx].children[0];
    const b = nid();
    mapping[b] = { id: b, parent: firstUser, children: [], message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['ABANDONED BRANCH TEXT'] }, create_time: time, metadata: {} } };
    mapping[firstUser].children.unshift(b);
  }
  return { title, create_time: t, update_time: time, mapping, current_node: parent, conversation_id: id, id, gizmo_id: gizmo || null, default_model_slug: 'gpt-5', is_archived: false };
}

const text = (role, s) => ({ role, content: { content_type: 'text', parts: [s] } });
const base = 1735700000; // 2025-01-01

const data = [
  conv({ id: 'c1', title: 'Calc II integration by parts', t: base, gizmo: 'g-p-aaa111', branch: true, turns: [
    text('user', 'How do I integrate x e^x?'),
    text('assistant', 'Use integration by parts with u = x, dv = e^x dx. Result: x e^x - e^x + C.'),
    text('user', 'And x^2 e^x?'),
    text('assistant', 'Apply it twice: (x^2 - 2x + 2)e^x + C.')
  ]}),
  conv({ id: 'c2', title: 'Series convergence tests', t: base + 86400 * 3, gizmo: 'g-p-aaa111', turns: [
    { role: 'user', content: { content_type: 'multimodal_text', parts: [{ content_type: 'image_asset_pointer', asset_pointer: 'file-service://file-x' }, 'Does this series converge?'] } },
    text('assistant', 'Yes, by the ratio test the limit is 1/2 < 1.')
  ]}),
  conv({ id: 'c3', title: 'Chess move validation in C++', t: base + 86400 * 10, gizmo: 'g-p-bbb222', turns: [
    text('user', 'How should I structure Piece classes for a chess engine?'),
    { role: 'assistant', recipient: 'python', content: { content_type: 'code', language: 'unknown', text: 'print(2+2)' } },
    { role: 'tool', content: { content_type: 'execution_output', text: '4' } },
    text('assistant', 'Use an abstract Piece base class with a virtual legalMoves() method.'),
    { role: 'assistant', recipient: 'canmore.create_textdoc', content: { content_type: 'code', language: 'json', text: JSON.stringify({ name: 'piece.h', type: 'code/cpp', content: 'class Piece { public: virtual ~Piece() = default; };' }) } }
  ]}),
  conv({ id: 'c4', title: 'Essay outline helper', t: base + 86400 * 20, gizmo: 'g-abc999', turns: [
    text('user', 'Outline an essay on renewable energy.'),
    text('assistant', '1. Intro 2. Solar 3. Wind 4. Conclusion')
  ]}),
  conv({ id: 'c5', title: 'Weekend recipe idea', t: base + 86400 * 30, turns: [
    text('user', 'Quick dinner with tofu?'),
    { role: 'assistant', content: { content_type: 'thoughts', thoughts: [{ content: 'thinking...' }] } },
    text('assistant', 'Crispy tofu stir-fry with garlic and soy.')
  ]}),
  conv({ id: 'c6', title: '', t: base + 86400 * 31, turns: [] }) // empty: dropped
];

const out = path.join(__dirname, 'fixtures');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'conversations.json'), JSON.stringify(data));
const zip = new JSZip();
zip.file('conversations.json', JSON.stringify(data));
zip.file('user.json', JSON.stringify({ id: 'user-1' }));
zip.file('chat.html', '<html></html>');
zip.generateAsync({ type: 'nodebuffer' }).then(b => {
  fs.writeFileSync(path.join(out, 'chatgpt-export.zip'), b);
  // Split-file variant used by newer exports
  const z2 = new JSZip();
  z2.file('conversations-000.json', JSON.stringify(data.slice(0, 3)));
  z2.file('conversations-001.json', JSON.stringify(data.slice(3)));
  return z2.generateAsync({ type: 'nodebuffer' });
}).then(b => {
  fs.writeFileSync(path.join(out, 'chatgpt-export-split.zip'), b);
  console.log('fixtures written');
});
