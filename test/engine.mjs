// test/engine.mjs —— 引擎逻辑测试（不依赖浏览器）
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['01-util.js','02-model.js','03-pairing.js','04-scoring.js','05-elim.js','06-season.js','12-ui-entry.js','15-io.js'];
const csvPath = join(root, '牌谱记录-赛事472725-好奇杯立直麻将赛.csv');
const csvText = fs.existsSync(csvPath) ? fs.readFileSync(csvPath, 'utf8') : '';

const store = new Map();
const sandbox = {
  console,
  window: {},
  document: { getElementById(){ return null; }, addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; } },
  localStorage: {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, v),
    removeItem: k => store.delete(k)
  },
  setTimeout: (fn) => { try { fn(); } catch (e) {} return 0; },
  clearTimeout(){},
  FileReader: class {},
  Blob: class {},
  __csv: csvText,
};
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
for (const f of files) {
  vm.runInContext(fs.readFileSync(join(root, 'src/js', f), 'utf8'), ctx, { filename: f });
}

let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ok  ' + name);
  else { fails++; console.log('  FAIL ' + name + (extra != null ? '  → ' + JSON.stringify(extra) : '')); }
}

const testSrc = String.raw`
(function(){
  var out = {};
  function fill(st, r){
    r.tables.forEach(function(tb, ti){
      var vals = tb.seats.map(function(s, si){ return 25000 + si * 3000 + ti * 200; });
      tb.seats.forEach(function(s, si){
        s.scores[0] = vals[si];
        s.scores[1] = vals[si] - 700;
        var rank = 1;
        vals.forEach(function(v){ if (v > vals[si]) rank++; });
        s.ranks[0] = rank; s.ranks[1] = rank;
      });
    });
  }

  /* ===== 场景1：积分赛 16 人 高高碰 2 轮 ===== */
  DB = newDB();
  var se = newSeason('S1'); se.id = 'se1'; DB.seasons.push(se);
  var t = newTournament('测试赛', 'se1');
  for (var i = 1; i <= 16; i++) t.players.push(newPlayer('P' + i));
  DB.tournaments.push(t);
  var st = newStage('POINTS', '积分赛');
  st.roundCount = 2; st.halvesPerRound = 2; st.advance.n = 8;
  st.pairing.mode = 'SWISS';
  t.stages.push(st);
  ensureEntrants(t, st);
  out.entrants = st.entrants.length;

  var r1 = startPointsRound(t, st);
  out.r1Tables = r1.tables.length;
  out.r1Byes = r1.byes.length;
  fill(st, r1); r1.status = 'confirmed';
  var r2 = startPointsRound(t, st);
  out.r2Tables = r2.tables.length;
  fill(st, r2); r2.status = 'confirmed';
  var rows = stageRanking(t, st);
  out.rows = rows.length;
  out.topPid = rows[0].pid;
  out.pointsSorted = rows.every(function(x, i){ return i === 0 || rows[i-1].point >= x.point; });
  out.firstSum = rows.reduce(function(a, x){ return a + x.first; }, 0);
  out.expectFirst = (r1.tables.length + r2.tables.length) * 2;
  out.adv = computeAdvancers(t, st, rows).length;

  var pid0 = rows[0].pid;
  setStageFix(st, pid0, -100);
  var rows2 = stageRanking(t, st);
  out.fixWorks = rows2[0].pid !== pid0 || rows2[0].point === rows[0].point - 100;

  st.ranking.manual = rows.map(function(r){ return r.pid; }).reverse();
  var manualRows = stageRanking(t, st);
  out.manualFirst = manualRows[0].pid;
  st.ranking.manual = null;
  st.ranking.fix = {};

  /* ===== 场景2：单败 8 人，每桌晋 2 ===== */
  var e1 = newStage('SINGLE', '单败');
  e1.seats = 4; e1.halvesPerRound = 2; e1.elim.perTable = 2; e1.advance.n = 4;
  e1.entrants = stageRanking(t, st).slice(0, 8).map(function(x){ return x.pid; });
  t.stages.push(e1);
  ensureEntrants(t, e1);
  var g = 0, seq = [];
  while (g++ < 10){
    var rr = startElimRound(t, e1);
    if (!rr) break;
    seq.push(rr.no + ':' + rr.type + ':' + rr.tables.length);
    fill(e1, rr);
    confirmElimRound(t, e1, rr);
    if (e1.elimState.done) break;
  }
  out.singleSeq = seq.join(' ');
  out.singleFin = elimFinalRanking(t, e1).length;

  /* ===== 场景3：双败 16 人 ===== */
  var t2 = newTournament('双败', 'se1');
  for (var j = 1; j <= 16; j++) t2.players.push(newPlayer('Q' + j));
  DB.tournaments.push(t2);
  var e2 = newStage('DOUBLE', '双败');
  e2.seats = 4; e2.halvesPerRound = 2; e2.elim.perTable = 2; e2.advance.n = 4;
  t2.stages.push(e2);
  ensureEntrants(t2, e2);
  var g2 = 0, seq2 = [];
  while (g2++ < 20){
    var r2b = startElimRound(t2, e2);
    if (!r2b) break;
    seq2.push(r2b.no + ':' + r2b.type + ':' + r2b.tables.length);
    fill(e2, r2b);
    confirmElimRound(t2, e2, r2b);
    if (e2.elimState.done) break;
  }
  out.doubleSeq = seq2.join(' ');
  out.doubleFinList = elimFinalRanking(t2, e2);
  out.doubleFin = out.doubleFinList.length;
  out.doubleDone = e2.elimState.done;

  /* ===== 场景4：3 人桌 12 人积分赛 ===== */
  var t3 = newTournament('三麻', 'se1');
  for (var k = 1; k <= 12; k++) t3.players.push(newPlayer('T' + k));
  DB.tournaments.push(t3);
  var st3 = newStage('POINTS', '三麻积分');
  st3.seats = 3; st3.halvesPerRound = 2; st3.roundCount = 1;
  st3.scoring.rankTable['3'] = [40, 0, -40];
  t3.stages.push(st3);
  ensureEntrants(t3, st3);
  var r3b = startPointsRound(t3, st3);
  out.threeTables = r3b.tables.length;
  out.threeSeats = r3b.tables.map(function(x){ return x.seats.length; }).join(',');
  fill(st3, r3b); r3b.status = 'confirmed';
  out.threeTop = stageRanking(t3, st3)[0].point;

  /* ===== 场景5：赛季积分 ===== */
  finishTournament(t);
  var board = computeSeasonBoard('se1');
  out.board = board.length;
  out.boardTop = board[0] && board[0].name;
  out.boardSum = board[0] && board[0].total;

  /* ===== 场景6：循环赛 8 人 3 轮 ===== */
  var t4 = newTournament('循环', 'se1');
  for (var m = 1; m <= 8; m++) t4.players.push(newPlayer('R' + m));
  DB.tournaments.push(t4);
  var st4 = newStage('POINTS', '循环');
  st4.roundCount = 3; st4.halvesPerRound = 1; st4.pairing.mode = 'RR'; st4.pairing.rrGroups = 1;
  t4.stages.push(st4);
  ensureEntrants(t4, st4);
  var pairSeen = {}, dup = 0;
  for (var rr2 = 0; rr2 < 3; rr2++){
    var rp = startPointsRound(t4, st4);
    fill(st4, rp);
    rp.tables.forEach(function(tb){
      for (var a = 0; a < tb.seats.length; a++)
        for (var b = a + 1; b < tb.seats.length; b++){
          var key = [tb.seats[a].pid, tb.seats[b].pid].sort().join('|');
          if (pairSeen[key]) dup++;
          pairSeen[key] = 1;
        }
    });
    rp.status = 'confirmed';
  }
  out.rrDup = dup;

  /* ===== 场景7：分层抽签 / 分档抽签 ===== */
  ['LAYER', 'TIER'].forEach(function(mode){
    var t5 = newTournament('编排-' + mode, 'se1');
    for (var p = 1; p <= 20; p++){ var pl = newPlayer('M' + p); pl.tier = String.fromCharCode(65 + ((p - 1) % 4)); t5.players.push(pl); }
    DB.tournaments.push(t5);
    var st5 = newStage('POINTS', mode);
    st5.halvesPerRound = 1; st5.pairing.mode = mode; st5.roundCount = 2;
    t5.stages.push(st5);
    ensureEntrants(t5, st5);
    var r5 = startPointsRound(t5, st5);
    fill(st5, r5); r5.status = 'confirmed';
    out[mode + 'Tables'] = st5.rounds.map(function(r){ return r.tables.map(function(x){ return x.seats.length; }).join('+'); }).join('/');
  });

  /* ===== 场景8：CSV 牌谱解析 ===== */
  var csvRows = csvParseText(__csv);
  var head = csvRows[0].map(function(x){ return String(x).trim(); });
  out.csvHeaders = head.length;
  out.csvHasPlayerCol = head.some(function(h){ return h.indexOf('1位玩家') >= 0; });
  out.csvRows = csvRows.length - 1;
  var pl0 = csvParsePlayer(csvRows[1][3]);
  out.csvFirstName = pl0.name;
  out.csvFirstUid = pl0.uid;

  /* ===== 场景9：阶段分数继承 ===== */
  var t6 = newTournament('继承', 'se1');
  for (var q = 1; q <= 8; q++) t6.players.push(newPlayer('S' + q));
  DB.tournaments.push(t6);
  var sa = newStage('POINTS', '第一阶段'); sa.roundCount = 1; sa.halvesPerRound = 1; sa.pairing.mode = 'PREV';
  t6.stages.push(sa);
  ensureEntrants(t6, sa);
  var ra = startPointsRound(t6, sa);
  fill(sa, ra); ra.status = 'confirmed';
  var sb = newStage('POINTS', '第二阶段'); sb.roundCount = 1; sb.halvesPerRound = 1;
  sb.inherit.mode = 'FULL'; sb.entrants = stageRanking(t6, sa).map(function(r){ return r.pid; });
  t6.stages.push(sb);
  var rb = startPointsRound(t6, sb);
  out.carryIn = Object.keys(sb.carryIn || {}).length;
  fill(sb, rb); rb.status = 'confirmed';
  var sbRows = stageRanking(t6, sb);
  out.carryApplied = sbRows[0].carry !== 0;

  /* ===== 场景10：淘汰赛轮间继承 ===== */
  var t7 = newTournament('轮间继承', 'se1');
  for (var w = 1; w <= 8; w++) t7.players.push(newPlayer('W' + w));
  DB.tournaments.push(t7);
  var se7 = newStage('SINGLE', '单败继承'); se7.seats = 4; se7.halvesPerRound = 1; se7.elim.perTable = 2;
  se7.elim.carry = true; se7.entrants = t7.players.map(function(p){ return p.id; });
  t7.stages.push(se7);
  ensureEntrants(t7, se7);
  var e7a = startElimRound(t7, se7); fill(se7, e7a); confirmElimRound(t7, se7, e7a);
  var e7b = startElimRound(t7, se7);
  out.carryRound = e7b ? e7b.tables[0].seats[0].carry !== 0 : false;

  /* ===== 场景11：CSV 导入匹配（用真实牌谱里的全部 44 位选手） ===== */
  var t8 = newTournament('csv导入', 'se1');
  var allRows = csvParseText(__csv);
  var seenPl = {};
  for (var ci = 1; ci < allRows.length; ci++){
    [3, 6, 9, 12].forEach(function(cj){
      var pl = csvParsePlayer(allRows[ci][cj]);
      if (!pl.name || seenPl[pl.uid || pl.name]) return;
      seenPl[pl.uid || pl.name] = 1;
      t8.players.push(newPlayer(pl.name, { uid: pl.uid }));
    });
  }
  DB.tournaments.push(t8);
  var st8 = newStage('POINTS', 'CSV轮'); st8.halvesPerRound = 2;
  st8.entrants = t8.players.map(function(p){ return p.id; });
  t8.stages.push(st8);
  ensureEntrants(t8, st8);
  var r8 = startPointsRound(t8, st8);
  var csvPlan = csvPlanImport(t8, st8, r8, __csv);
  out.csvPlayers = t8.players.length;
  out.csvPlanCount = csvPlan.planned.length;
  out.csvPlanSkip = csvPlan.skipped.length;
  out.csvPlanUnmatch = (csvPlan.unmatch || []).length;

  /* ===== 场景12：纯分数 + 名次修正反推小分 ===== */
  var t9 = newTournament('反推', 'se1');
  for (var v = 1; v <= 4; v++) t9.players.push(newPlayer('V' + v));
  DB.tournaments.push(t9);
  var st9 = newStage('POINTS', '反推轮');
  st9.halvesPerRound = 1; st9.scoring.mode = 'PURE';
  st9.scoring.entryMode = 'ADJUSTED';
  st9.scoring.rankTable['4'] = [50, 10, -10, -30];
  st9.entrants = t9.players.map(function(p){ return p.id; });
  t9.stages.push(st9);
  ensureEntrants(t9, st9);
  var r9 = startPointsRound(t9, st9);
  var vals9 = [30000, 20000, 10000, 0];
  r9.tables[0].seats.forEach(function(s, si){ s.scores[0] = vals9[si]; });
  r9.status = 'confirmed';
  var calc9 = calcRound(st9, r9)[0].rows;
  out.adjPoints = calc9.map(function(x){ return x.point; });
  out.adjRaws = calc9.map(function(x){ return x.raw; });
  var rank9 = stageRanking(t9, st9);
  out.adjTopPid = rank9[0].pid;
  out.adjSeat0Pid = r9.tables[0].seats[0].pid;
  out.adjTopRaw = rank9[0].raw;

  /* ===== 场景13：名次分按每局 ===== */
  var ta = newTournament('每局名次分', 'se1');
  for (var z = 1; z <= 4; z++) ta.players.push(newPlayer('H' + z));
  DB.tournaments.push(ta);
  var sha = newStage('POINTS', '每局');
  sha.halvesPerRound = 2; sha.roundCount = 1;
  sha.scoring.mode = 'RANK_POINT';
  sha.scoring.rankBasisRound = false;
  sha.scoring.rankBasisHand = true;
  sha.scoring.rankTable['4'] = [10, 5, 0, -5];
  sha.entrants = ta.players.map(function(p){ return p.id; });
  ta.stages.push(sha);
  ensureEntrants(ta, sha);
  var ra2 = startPointsRound(ta, sha);
  var seats13 = ra2.tables[0].seats;
  var s13 = [[400, 300], [300, 100], [200, 200], [100, 400]];
  seats13.forEach(function(s, si){ s.scores[0] = s13[si][0]; s.scores[1] = s13[si][1]; });
  ra2.status = 'confirmed';
  var rows13 = stageRanking(ta, sha);
  out.handPoints = seats13.map(function(s){
    var r = rows13.filter(function(x){ return x.pid === s.pid; })[0];
    return r ? r.point : null;
  });
  /* 共存：每轮 + 每局 同时启用，再叠加可自定义的 TOP 加分 */
  sha.scoring.rankBasisRound = true;
  rows13 = stageRanking(ta, sha);
  out.bothPoints = seats13.map(function(s){
    var r = rows13.filter(function(x){ return x.pid === s.pid; })[0];
    return r ? r.point : null;
  });
  sha.scoring.topBonus.on = true;
  sha.scoring.topBonus.values = [20, 10, 5, 0];
  rows13 = stageRanking(ta, sha);
  out.topBonusPoint = rows13.filter(function(x){ return x.pid === seats13[0].pid; })[0].point;

  /* ===== 场景14：阶段积分叠加 / 单独计算 ===== */
  var tb1 = newTournament('阶段积分', 'se1');
  for (var y = 1; y <= 4; y++) tb1.players.push(newPlayer('J' + y));
  DB.tournaments.push(tb1);
  var s1 = newStage('POINTS', '第一阶段'); s1.halvesPerRound = 1; s1.roundCount = 1;
  s1.points.on = true; s1.points.rankTable = [10, 5, 2, 1]; s1.points.stack = true;
  s1.entrants = tb1.players.map(function(p){ return p.id; });
  tb1.stages.push(s1);
  ensureEntrants(tb1, s1);
  var rr1 = startPointsRound(tb1, s1);
  rr1.tables[0].seats.forEach(function(s){
    var idx = tb1.players.map(function(p){ return p.id; }).indexOf(s.pid);
    s.scores[0] = 400 - idx * 100;
  });
  rr1.status = 'confirmed';
  var s2 = newStage('POINTS', '第二阶段'); s2.halvesPerRound = 1; s2.roundCount = 1;
  s2.points.on = true; s2.points.rankTable = [10, 5, 2, 1]; s2.points.stack = true;
  s2.entrants = tb1.players.map(function(p){ return p.id; });
  tb1.stages.push(s2);
  ensureEntrants(tb1, s2);
  var rr2b = startPointsRound(tb1, s2);
  rr2b.tables[0].seats.forEach(function(s){
    var idx = tb1.players.map(function(p){ return p.id; }).indexOf(s.pid);
    s.scores[0] = 400 - idx * 100;
  });
  rr2b.status = 'confirmed';
  var ptsBoth = computeTournamentPoints(tb1);
  var firstId = tb1.players[0].id;
  out.stageSum = ptsBoth[firstId] ? ptsBoth[firstId].points : null;
  out.stageNote = ptsBoth[firstId] ? ptsBoth[firstId].note : '';
  s2.points.stack = false;
  var ptsOne = computeTournamentPoints(tb1);
  out.stageNoStack = ptsOne[firstId] ? ptsOne[firstId].points : null;

  /* ===== 场景15：轮修正只进主分、不进小分；每轮 3 局 ===== */
  var t10 = newTournament('轮修正', 'se1');
  for (var u = 1; u <= 4; u++) t10.players.push(newPlayer('K' + u));
  DB.tournaments.push(t10);
  var s10 = newStage('POINTS', '三局轮');
  s10.halvesPerRound = 3; s10.roundCount = 1;
  s10.scoring.mode = 'RANK_POINT';
  s10.scoring.rankBasisRound = false;
  s10.scoring.rankBasisHand = true;
  s10.scoring.rankTable['4'] = [10, 5, 0, -5];
  s10.entrants = t10.players.map(function(p){ return p.id; });
  t10.stages.push(s10);
  ensureEntrants(t10, s10);
  var r10 = startPointsRound(t10, s10);
  var seats10 = r10.tables[0].seats;
  var vals10 = [400, 300, 200, 100];
  seats10.forEach(function(s, si){
    s.scores[0] = vals10[si]; s.scores[1] = vals10[si]; s.scores[2] = vals10[si];
  });
  seats10[0].bonus = 50;
  r10.status = 'confirmed';
  var rows10 = stageRanking(t10, s10);
  var m10 = rows10.filter(function(x){ return x.pid === seats10[0].pid; })[0];
  out.threeHalvesPoint = m10.point;
  out.threeHalvesRaw = m10.raw;

  return JSON.stringify(out);
})()
`;

const raw = vm.runInContext(testSrc, ctx, { filename: 'scenarios.js' });
const o = JSON.parse(raw);
console.log('--- 场景结果 ---');
console.log(JSON.stringify(o, null, 1));
console.log('--- 断言 ---');
check('16人参赛', o.entrants === 16, o.entrants);
check('第1轮 4 桌', o.r1Tables === 4, o.r1Tables);
check('第2轮 4 桌', o.r2Tables === 4, o.r2Tables);
check('排名 16 行', o.rows === 16, o.rows);
check('积分降序', o.pointsSorted === true);
check('一位总数正确', o.firstSum === o.expectFirst, [o.firstSum, o.expectFirst]);
check('晋级 8 人', o.adv === 8, o.adv);
check('修正分生效', o.fixWorks === true);
check('手动排名生效', o.manualFirst !== o.topPid, o.manualFirst);
check('单败 2 轮结束', o.singleSeq.split(' ').length === 2, o.singleSeq);
check('单败 8 人名次', o.singleFin === 8, o.singleFin);
check('双败结束', o.doubleDone === true, o.doubleSeq);
check('双败 16 人名次', o.doubleFin === 16, o.doubleFin);
check('双败名次无重复', new Set(o.doubleFinList).size === 16, o.doubleFinList.length);
check('双败含总决赛', o.doubleSeq.indexOf('GF') >= 0, o.doubleSeq);
check('三麻 4 桌', o.threeTables === 4, o.threeTables);
check('三麻每桌 3 人', o.threeSeats === '3,3,3,3', o.threeSeats);
check('三麻首位分 40', o.threeTop >= 40, o.threeTop);
check('赛季榜有数据', o.board > 0, o.board);
check('循环赛重复 ≤ 8', o.rrDup <= 8, o.rrDup);
check('分层抽签 5 桌', o.LAYERTables.split('/')[0] === '4+4+4+4+4', o.LAYERTables);
check('分档抽签 5 桌', o.TIERTables.split('/')[0] === '4+4+4+4+4', o.TIERTables);
check('CSV 表头 17 列', o.csvHeaders === 17 && o.csvHasPlayerCol === true, [o.csvHeaders, o.csvHasPlayerCol]);
check('CSV 解析 24 局', o.csvRows === 24, o.csvRows);
check('CSV 玩家解析', o.csvFirstUid === '54137877' && o.csvFirstName === 'qrk415', [o.csvFirstUid, o.csvFirstName]);
check('阶段继承写入', o.carryIn === 8 && o.carryApplied === true, [o.carryIn, o.carryApplied]);
check('淘汰赛轮间继承', o.carryRound === true, o.carryRound);
check('CSV 全量匹配 24 局', o.csvPlanCount === 24 && o.csvPlanSkip === 0 && o.csvPlanUnmatch === 0,
  [o.csvPlanCount, o.csvPlanSkip, o.csvPlanUnmatch]);
check('反推：主分=录入值', JSON.stringify(o.adjPoints) === JSON.stringify([30000,20000,10000,0]), o.adjPoints);
check('反推：小分=录入值−名次修正', JSON.stringify(o.adjRaws) === JSON.stringify([29950,19990,10010,30]), o.adjRaws);
check('反推：排名与总分一致', o.adjTopPid === o.adjSeat0Pid && o.adjTopRaw === 29950, [o.adjTopPid, o.adjSeat0Pid, o.adjTopRaw]);
check('名次分按每局累加', JSON.stringify(o.handPoints) === JSON.stringify([15, 0, 0, 5]), o.handPoints);
check('每轮+每局共存相加', JSON.stringify(o.bothPoints) === JSON.stringify([25, -2.5, -2.5, 10]), o.bothPoints);
check('旧版 TOP 加分兼容', o.topBonusPoint === 45, o.topBonusPoint);
check('阶段积分叠加为总分', o.stageSum === 20 && o.stageNote.indexOf('+') > 0, [o.stageSum, o.stageNote]);
check('阶段积分单独计算不计入总分', o.stageNoStack === 10, o.stageNoStack);
check('每轮 3 局名次分累加', o.threeHalvesPoint === 80, o.threeHalvesPoint);
check('轮修正不影响小分', o.threeHalvesRaw === 1200, o.threeHalvesRaw);
console.log(fails ? ('\n失败 ' + fails + ' 项') : '\n全部通过');
process.exit(fails ? 1 : 0);
