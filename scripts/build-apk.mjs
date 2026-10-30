// build-apk.mjs —— 手工构建 APK（aapt2 + javac + d8 + zipalign + apksigner）
// 注：aapt2.exe 在 Windows 下不认非 ASCII 路径，因此整个构建过程放在临时英文目录里跑。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const sdk = 'C:\\AndroidBuild\\android-sdk';
const jdk = 'C:\\AndroidBuild\\jdk21';
const bt = path.join(sdk, 'build-tools', '35.0.0');
const androidJar = path.join(sdk, 'platforms', 'android-35', 'android.jar');
const work = path.join(os.tmpdir(), 'mtt-apk-build');
const outDir = path.join(root, 'dist', 'apk');

function run(cmd, args, cwd) {
  console.log('>', path.basename(cmd), args.join(' '));
  execFileSync(cmd, args, { stdio: 'inherit', cwd: cwd || work });
}
function rm(p) { fs.rmSync(p, { recursive: true, force: true }); }
function mk(p) { fs.mkdirSync(p, { recursive: true }); }
function walk(dir, ext) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f, ext));
    else if (e.name.endsWith(ext)) out.push(f);
  }
  return out;
}

console.log('== 清理 ==');
rm(work); rm(outDir);
for (const d of ['src/java/com/mahjong/tournament', 'res/values', 'assets', 'gen', 'classes', 'dex']) mk(path.join(work, d));
mk(outDir);

console.log('== 拷贝资源 ==');
fs.copyFileSync(path.join(root, 'dist', '麻将赛事管理.html'), path.join(work, 'assets', 'index.html'));
fs.copyFileSync(path.join(root, 'android', 'res', 'values', 'strings.xml'), path.join(work, 'res', 'values', 'strings.xml'));
fs.copyFileSync(path.join(root, 'android', 'AndroidManifest.xml'), path.join(work, 'AndroidManifest.xml'));
fs.copyFileSync(path.join(root, 'android', 'java', 'com', 'mahjong', 'tournament', 'MainActivity.java'),
  path.join(work, 'src', 'java', 'com', 'mahjong', 'tournament', 'MainActivity.java'));

console.log('== aapt2 compile ==');
run(path.join(bt, 'aapt2.exe'), ['compile', '--dir', 'res', '-o', 'res.zip']);

console.log('== aapt2 link ==');
run(path.join(bt, 'aapt2.exe'), [
  'link', '-o', 'base.apk', '-I', androidJar,
  '--manifest', 'AndroidManifest.xml',
  '-A', 'assets', '--java', 'gen', '--auto-add-overlay', 'res.zip',
]);

console.log('== javac ==');
const srcs = walk(path.join(work, 'src'), '.java').concat(walk(path.join(work, 'gen'), '.java'));
run(path.join(jdk, 'bin', 'javac.exe'), [
  '-encoding', 'UTF-8', '-source', '8', '-target', '8', '-nowarn',
  '-cp', androidJar, '-d', 'classes', ...srcs,
]);

console.log('== d8 ==');
const classes = walk(path.join(work, 'classes'), '.class');
run(path.join(jdk, 'bin', 'java.exe'), [
  '-cp', path.join(bt, 'lib', 'd8.jar'), 'com.android.tools.r8.D8',
  '--release', '--lib', androidJar, '--min-api', '24',
  '--output', 'dex', ...classes,
]);

console.log('== 打包 dex ==');
run(path.join(jdk, 'bin', 'jar.exe'), ['--update', '--file', 'base.apk', '-C', 'dex', 'classes.dex']);

console.log('== zipalign ==');
run(path.join(bt, 'zipalign.exe'), ['-f', '4', 'base.apk', 'aligned.apk']);

console.log('== 签名 ==');
const ks = path.join(work, 'mtt.keystore');
run(path.join(jdk, 'bin', 'keytool.exe'), [
  '-genkeypair', '-keystore', 'mtt.keystore', '-alias', 'mtt', '-keyalg', 'RSA', '-keysize', '2048',
  '-validity', '10000', '-storepass', 'mtt12345', '-keypass', 'mtt12345',
  '-dname', 'CN=Mahjong Tournament, O=Local, C=CN', '-noprompt',
]);
const apkTmp = path.join(work, 'signed.apk');
run(path.join(jdk, 'bin', 'java.exe'), [
  '-jar', path.join(bt, 'lib', 'apksigner.jar'), 'sign',
  '--ks', 'mtt.keystore', '--ks-pass', 'pass:mtt12345', '--key-pass', 'pass:mtt12345',
  '--out', 'signed.apk', 'aligned.apk',
]);
run(path.join(jdk, 'bin', 'java.exe'), [
  '-jar', path.join(bt, 'lib', 'apksigner.jar'), 'verify', '--verbose', 'signed.apk',
]);

const apk = path.join(outDir, '麻将赛事管理.apk');
fs.copyFileSync(apkTmp, apk);
const size = (fs.statSync(apk).size / 1024 / 1024).toFixed(2);
console.log(`完成: ${apk}  ${size} MB`);
