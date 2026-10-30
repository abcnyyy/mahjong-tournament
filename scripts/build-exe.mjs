// build-exe.mjs —— 用本机 Electron 组装绿色版 EXE 目录（免安装，双击运行）
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = 'C:\\AndroidBuild\\electron-dist';
const out = path.join(root, 'dist', 'exe');

console.log('== 清理 ==');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

console.log('== 拷贝 Electron 运行时 ==');
fs.cpSync(src, out, { recursive: true });
fs.rmSync(path.join(out, 'default_app.asar'), { force: true });
fs.rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true });

console.log('== 写入应用 ==');
const appDir = path.join(out, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });
fs.copyFileSync(path.join(root, 'dist', '麻将赛事管理.html'), path.join(appDir, 'index.html'));
for (const f of ['main.js', 'preload.js', 'package.json']) {
  fs.copyFileSync(path.join(root, 'desktop', f), path.join(appDir, f));
}

console.log('== 重命名可执行文件 ==');
const exeSrc = path.join(out, 'electron.exe');
const exeDst = path.join(out, '麻将赛事管理.exe');
if (fs.existsSync(exeSrc)) fs.renameSync(exeSrc, exeDst);

// 说明文件
fs.writeFileSync(path.join(out, '使用说明.txt'),
  '麻将赛事管理（Windows 绿色版）\r\n\r\n' +
  '1. 双击「麻将赛事管理.exe」即可运行，无需安装。\r\n' +
  '2. 数据自动保存在：C:\\Users\\<用户名>\\AppData\\Roaming\\mahjong-tournament\\data.json\r\n' +
  '   同目录下还有 data.bak.json 作为上一版备份。\r\n' +
  '3. 也可以在软件内「导出全部数据」保存 JSON 备份。\r\n' +
  '4. 首次运行若 Windows 提示「已保护你的电脑」，点「更多信息 → 仍要运行」。\r\n',
  'utf8');

let total = 0;
for (const e of fs.readdirSync(out)) {
  const s = fs.statSync(path.join(out, e));
  if (s.isFile()) total += s.size;
}
console.log('== 完成 ==', out, (total / 1024 / 1024).toFixed(1) + ' MB（不含子目录）');
