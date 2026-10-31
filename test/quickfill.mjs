// test/quickfill.mjs —— 验证 tools/快速填分脚本.js 与本软件数据模型兼容
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'src/js');
const files = ['01-util.js','02-model.js','03-pairing.js','04-scoring.js','05-elim.js','06-season.js',
  '10-ui-core.js','11-ui-tournament.js','12-ui-entry.js','13-ui-rank.js','14-ui-season.js','15-io.js'];

function fakeEl(id) {
  return {
    id, innerHTML: '', value: '', textContent: '', style: {}, dataset: {},
    classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    appendChild(){}, removeChild(){}, remove(){}, addEventListener(){},
    setAttribute(){}, getAttribute(){ return null; }, focus(){}, select(){},
    insertAdjacentHTML(){}, closest(){ return null; },
    get firstElementChild(){ return null; }
  };
}
const els = {};
const store = new Map();
const sandbox = {
  console,
  window: { addEventListener(){}, scrollTo(){}, open(){ return null; } },
  document: {
    getElementById(id) { return els[id] || (els[id] = fakeEl(id)); },
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    createElement(){ return fakeEl('x'); },
    addEventListener(){},
    body: fakeEl('body')
  },
  localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) },
  setTimeout: (fn) => { try { fn(); } catch(e){} return 0; },
  clearTimeout(){},
  Blob: class {}, FileReader: class {}, URL: { createObjectURL(){ return ''; }, revokeObjectURL(){} },
};
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
for (const f of files) vm.runInContext(readFileSync(join(jsDir, f), 'utf8'), ctx, { filename: f });

const setup = String.raw`
(function(){
  DB = newDB();
  var se = newSeason('S'); se.id='se1'; DB.seasons.push(se);
  var t = newTournament('测试','se1');
  for (var i=1;i<=8;i++) t.players.push(newPlayer('P'+i));
  DB.tournaments.push(t);
  var st = newStage('POINTS','积分');
  st.halvesPerRound = 2; st.roundCount = 2;
  t.stages.push(st);
  APP.tid=t.id; APP.stageId=st.id; APP.tab='entry';
  ensureEntrants(t, st);
  startPointsRound(t, st);
  return 'ok';
})()
`;
vm.runInContext(setup, ctx, { filename: 'setup.js' });

const toolSrc = readFileSync(join(root, 'tools', '快速填分脚本.js'), 'utf8');
vm.runInContext(toolSrc, ctx, { filename: '快速填分脚本.js' });

let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ok  ' + name);
  else { fails++; console.log('  FAIL ' + name + (extra != null ? '  → ' + JSON.stringify(extra) : '')); }
}

const out = JSON.parse(vm.runInContext(String.raw`
(function(){
  var st = curStage(), t = curTournament();
  var r = openRound(st);
  var Q = window.QCFill;
  Q.fillCurrent();
  var halves = st.halvesPerRound, sums = [], ranksOk = true, filled = 0;
  r.tables.forEach(function(tb){
    var seats = tb.seats.filter(function(s){ return s.pid; });
    for (var h=0; h<halves; h++){
      var sum = 0, ranks = [];
      seats.forEach(function(s){ sum += Number(s.scores[h])||0; ranks.push(Number(s.ranks[h])||0); });
      sums.push(sum);
      ranks.sort(function(a,b){ return a-b; });
      for (var k=0;k<ranks.length;k++) if (ranks[k] !== k+1) ranksOk = false;
      if (ranks.length) filled++;
    }
  });
  var problems = Q.verify();
  Q.clearCurrent();
  var cleared = true;
  r.tables.forEach(function(tb){ tb.seats.forEach(function(s){
    for (var h=0;h<halves;h++) if (Number(s.scores[h])!==0) cleared = false;
  }); });
  return JSON.stringify({ sums: sums, ranksOk: ranksOk, filled: filled, problems: problems, cleared: cleared,
    tables: r.tables.length, seats: r.tables[0].seats.length });
})()
`, ctx, { filename: 'run.js' }));

console.log('--- 结果 ---');
console.log(JSON.stringify(out, null, 1));
check('桌数 = 2', out.tables === 2, out.tables);
check('每桌 4 人', out.seats === 4, out.seats);
check('每桌每局点数和 = 0', out.sums.every(s => Math.abs(s) < 1e-6), out.sums);
check('顺位为 1..N', out.ranksOk === true);
check('自检无问题', out.problems.length === 0, out.problems);
check('清空生效', out.cleared === true);

console.log(fails ? ('\n失败 ' + fails + ' 项') : '\n全部通过');
process.exit(fails ? 1 : 0);
