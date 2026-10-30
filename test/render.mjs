// test/render.mjs —— 用假 DOM 跑一遍全部页面渲染，抓模板报错
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'src/js');
const files = readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();

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
  setTimeout: (fn) => { try { fn(); } catch(e){ console.log('setTimeout err:', e.message); } return 0; },
  clearTimeout(){},
  Blob: class {}, FileReader: class {}, URL: { createObjectURL(){ return ''; }, revokeObjectURL(){} },
};
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
for (const f of files) {
  try { vm.runInContext(readFileSync(join(jsDir, f), 'utf8'), ctx, { filename: f }); }
  catch (e) { console.log('LOAD FAIL', f, e.message); process.exit(1); }
}

const script = String.raw`
(function(){
  var report = [];
  DB = newDB();
  var se = newSeason('赛季A'); se.id='se1'; DB.seasons.push(se);
  var t = newTournament('秋季赛','se1');
  for (var i=1;i<=9;i++){ var p = newPlayer('玩家'+i); if (i%3===0) p.tier='A'; if(i%4===0) p.tier='B'; t.players.push(p); }
  DB.tournaments.push(t);

  var st = newStage('POINTS','积分赛'); st.roundCount=3; st.halvesPerRound=2; st.advance.n=4;
  t.stages.push(st);
  var e = newStage('SINGLE','单败'); e.seats=4; e.halvesPerRound=2; e.elim.perTable=2; t.stages.push(e);

  APP.tid = t.id;
  APP.view='home'; render(); report.push('home '+document.getElementById('app').innerHTML.length);
  APP.view='season'; APP.seasonId='se1'; render(); report.push('season '+document.getElementById('app').innerHTML.length);
  APP.seasonRules = true; render(); report.push('seasonRules');
  APP.view='about'; render(); report.push('about');
  APP.view='tournament';
  APP.stageId=null; render(); report.push('players');
  APP.stageId=st.id;
  ['config','entry','rank','advance'].forEach(function(tab){ APP.tab=tab; render(); report.push('points/'+tab+' '+document.getElementById('app').innerHTML.length); });
  /* 生成一轮再渲染 */
  ensureEntrants(t, st);
  startPointsRound(t, st);
  APP.tab='entry'; render();
  var ehtml = document.getElementById('app').innerHTML;
  report.push('输入框=' + (ehtml.indexOf('data-field="score"') >= 0 ? '有' : '无'));
  report.push('加分栏=' + (ehtml.indexOf('data-field="bonus"') >= 0 ? '有' : '无'));
  ['entry','rank','advance'].forEach(function(tab){ APP.tab=tab; render(); report.push('r1/'+tab); });
  var r = st.rounds[0];
  r.tables[0].seats.forEach(function(s){ s.scores=[30000,20000]; s.ranks=[1,2]; });
  APP.tab='rank'; render(); report.push('filled/rank');
  r.status='confirmed'; APP.tab='entry'; render();
  var chtml = document.getElementById('app').innerHTML;
  report.push('确认后只读=' + (chtml.indexOf('data-field="score"') < 0 ? '是' : '否'));
  APP.tab='rank'; render(); report.push('confirmed/rank');

  APP.stageId=e.id;
  ['config','entry','bracket','advance','rank'].forEach(function(tab){ APP.tab=tab; render(); report.push('elim/'+tab); });
  e.entrants = [t.players[0].id,t.players[1].id,t.players[2].id,t.players[3].id];
  ensureEntrants(t,e); startElimRound(t,e);
  ['entry','bracket','advance'].forEach(function(tab){ APP.tab=tab; render(); report.push('elimR1/'+tab); });

  /* 弹窗类 */
  openTournamentMenu(); closeAllModals();
  openDataMenu(); closeAllModals();
  APP.tid = t.id;
  return report.join('\n');
})()
`;
try {
  const out = vm.runInContext(script, ctx, { filename: 'render.js' });
  console.log(out);
  console.log('\nrender OK');
} catch (e) {
  console.log('RENDER FAIL:', e && e.stack || e);
  process.exit(1);
}
