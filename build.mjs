// build.mjs —— 把 src 组装成单文件 HTML（dist/麻将赛事管理.html）
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

const css = readFileSync(join(src, 'style.css'), 'utf8');
const jsDir = join(src, 'js');
const files = readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
const js = files.map(f => `/* ===== ${f} ===== */\n` + readFileSync(join(jsDir, f), 'utf8')).join('\n');

let html = readFileSync(join(src, 'index.html'), 'utf8');
html = html.replace('<!--STYLE-->', '<style>\n' + css + '\n</style>');
html = html.replace('<!--SCRIPTS-->', '<script>\n' + js + '\n</script>');

const out = join(dist, '麻将赛事管理.html');
writeFileSync(out, html, 'utf8');
console.log('built:', out, (html.length / 1024).toFixed(1) + ' KB', '| js files:', files.join(', '));
