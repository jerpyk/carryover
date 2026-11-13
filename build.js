// Builds the website into one self-contained page: dist/index.html
const fs = require('fs');
const path = require('path');
const r = p => fs.readFileSync(path.join(__dirname, p), 'utf8');
const safe = s => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
const fill = (tpl, map) => Object.entries(map).reduce((s, [k, v]) => s.replace(`%%${k}%%`, () => v), tpl);

const mcp = Object.fromEntries(['server.js', 'package.json', 'README.md'].map(n => [n, r('mcp-server/' + n)]));
const html = fill(r('src/shell.html'), {
  FONTS: '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">',
  STYLES: '<style>\n' + r('src/app.css') + '</style>',
  STEP1: r('src/step1-web.html'),
  SCRIPTS: [
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>',
    '<script>' + safe(r('src/parser.js')) + '</script>',
    '<script>\nwindow.MCP_FILES = ' + safe(JSON.stringify(mcp)) + ';\nwindow.SAMPLE_EXPORT = ' + safe(r('test/fixtures/conversations.json')) + ';\n</script>',
    '<script>\n' + safe(r('src/app.js')) + '</script>'
  ].join('\n')
});
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/index.html'), html);
console.log('Built dist/index.html (' + (html.length / 1024).toFixed(1) + ' KB)');
