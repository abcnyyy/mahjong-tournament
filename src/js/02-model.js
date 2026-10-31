'use strict';
/* =====================================================================
 * 02-model.js  数据模型 / 默认值 / 迁移 / 存取
 * ===================================================================== */

var DB = null;
var APP = {
  view: 'home',        // home | tournament | stage | season | players | settings
  tid: null,
  stageId: null,
  tab: 'entry',        // entry | rank | bracket | result
  roundNo: null,
  seasonId: null,
  help: false
};

/* ---------- 工厂 ---------- */
function newSeason(name){
  return {
    id: uid('se'), name: name || '赛季 1',
    startDate: fmtDate(Date.now()), endDate: '',
    rules: {
      mode: 'TABLE',                       // TABLE 名次表 | LINEAR 线性公式
      rankTable: [100, 80, 65, 50, 40, 30, 20, 10],   // 第1名→…（超出取最后一项/0）
      beyond: 0,
      linear: { max: 50, min: 10 },
      special: { withdrawn: 10, absent: 0, dq: 0, unplayed: 0 },
      count: 'all',                        // all 赛季内全部 | rolling 最近N场
      rollingN: 4,
      includeStages: 'all'
    }
  };
}
function newTournament(name, seasonId){
  return {
    id: uid('tn'), name: name || '未命名赛事', createdAt: Date.now(), status: 'ongoing',
    seasonId: seasonId || '', players: [], stages: [],
    result: { final: [], manual: null, points: {}, note: '' }
  };
}
function newPlayer(name, opt){
  opt = opt || {};
  return {
    id: uid('pl'), name: String(name || '').trim() || '未命名',
    uid: opt.uid || '', source: opt.source || 'manual', tier: opt.tier || '',
    withdrawn: false, disqualified: false, note: '', seed: 0
  };
}
function newStage(format, name){
  var st = {
    id: uid('st'), name: name || defaultStageName(format),
    format: format || 'POINTS', seats: 4,
    roundCount: format === 'POINTS' ? 3 : 3,
    halvesPerRound: format === 'POINTS' ? 2 : 3,
    status: 'pending',
    /* 积分赛编排 */
    pairing: {
      mode: 'RANDOM',                    // RANDOM | SWISS | LAYER | TIER | RR | PREV
      chain: ['SWISS', 'LAYER'],         // 多编排并存时的回退链
      seed: 'PREV',                      // RANDOM | PREV | MANUAL（首轮种子来源）
      layerSize: 4,                      // 分层抽签：每层人数
      avoidRepeat: 'soft',               // strict | soft | off
      remainder: 'BYE',                  // BYE | THREE | GHOST（人数不整除时）
      rrGroups: 1,                       // 循环赛：分成几个小组
      roundOverride: {}                  // {轮次:mode} 每轮单独覆盖
    },
    /* 计分 */
    scoring: {
      mode: 'RANK_POINT',                // RANK_POINT 排名分 | PURE 纯分数+修正
      rankSource: 'TABLE',               // TABLE 桌内 | GLOBAL 全场
      rankBasis: 'ROUND',                // ROUND 名次分按每轮 | HAND 名次分按每局
      rankTable: { '4': [50, 10, -10, -30], '3': [30, 0, -30], '2': [15, -15] },
      tieSplit: true,                    // 并列顺位平分名次分
      topBonus: { on: false, values: [15, 7.5, 5, 0] },   // 同桌并列 top 加分
      water: { on: false, threshold: 0, plus: 0, minus: 0 }, // 水上/水下修正
      entryMode: 'RAW',                   // RAW 录原始点数 | ADJUSTED 录含名次修正的点数（反推小分）
      byePoint: 0,                        // 轮空得分
      manual: true                       // 手动加减栏
    },
    /* 继承 */
    inherit: { mode: 'RESET', ratio: 1, includeRank: false },  // RESET | FULL | RATIO
    /* 阶段积分（赛季积分按阶段计算） */
    points: {
      on: false,
      mode: 'TABLE',                    // TABLE 名次表 | LINEAR 线性公式
      rankTable: [100, 80, 65, 50, 40, 30, 20, 10],
      beyond: 0,
      linear: { max: 50, min: 10 },
      special: { withdrawn: 10, dq: 0, unplayed: 0 },
      stack: true                       // true 与上一阶段叠加为总积分 | false 本阶段单独计算
    },
    /* 破同分 */
    tiebreak: { chain: ['RAW', 'AVG_RANK', 'FIRST', 'SECOND', 'LAST', 'H2H', 'SEED'] },
    /* 晋级 */
    advance: { type: 'TOP_N', n: 16, min: 0 },
    /* 淘汰赛 */
    elim: { perTable: 2, carry: false, grandFinal: 'TOPK' },
    rounds: [],
    carryIn: {},                          // {pid: 分}
    ranking: { auto: [], manual: null, locked: false, finalRanking: null, notes: [] }
  };
  return st;
}
function defaultStageName(format){
  if (format === 'SINGLE') return '单败淘汰';
  if (format === 'DOUBLE') return '双败淘汰';
  return '积分赛';
}
function defaultSeat(pid){
  return { pid: pid, scores: [], ranks: [], bonus: 0, penalty: 0, late: 0, absent: 0, note: '', carry: 0, manualRank: null };
}
function defaultRound(no){
  return { no: no, tables: [], byes: [], status: 'open', carryIn: {}, adv: [], note: '' };
}
function newTable(seats){
  return { id: uid('tb'), seats: seats || [] };
}

/* ---------- 规范 / 迁移 ---------- */
function newDB(){
  return { version: 2, seenWelcome: false, activeSeasonId: '', seasons: [], tournaments: [], pointTemplates: [], settings: { orgName: '' } };
}
function normalizeDB(d){
  if (!d || typeof d !== 'object') return newDB();
  if (!Array.isArray(d.seasons)) d.seasons = [];
  if (!Array.isArray(d.tournaments)) d.tournaments = [];
  if (!Array.isArray(d.pointTemplates)) d.pointTemplates = [];
  if (!d.settings || typeof d.settings !== 'object') d.settings = { orgName: '' };
  d.version = 2;
  d.seenWelcome = !!d.seenWelcome;
  d.seasons.forEach(normalizeSeason);
  d.tournaments.forEach(normalizeTournament);
  return d;
}
function normalizeSeason(s){
  s.id = s.id || uid('se');
  s.name = s.name || '未命名赛季';
  s.startDate = s.startDate || '';
  s.endDate = s.endDate || '';
  var r = s.rules = s.rules || {};
  if (!Array.isArray(r.rankTable) || !r.rankTable.length) r.rankTable = [100, 80, 65, 50, 40, 30, 20, 10];
  r.beyond = num(r.beyond) || 0;
  r.mode = r.mode === 'LINEAR' ? 'LINEAR' : 'TABLE';
  r.linear = r.linear || { max: 50, min: 10 };
  r.special = Object.assign({ withdrawn: 10, absent: 0, dq: 0, unplayed: 0 }, r.special || {});
  r.count = r.count === 'rolling' ? 'rolling' : 'all';
  r.rollingN = Math.max(1, Math.round(num(r.rollingN) || 4));
  r.includeStages = r.includeStages || 'all';
  return s;
}
function normalizeTournament(t){
  t.id = t.id || uid('tn');
  t.name = t.name || '未命名赛事';
  t.createdAt = num(t.createdAt) || Date.now();
  t.status = t.status === 'done' ? 'done' : 'ongoing';
  t.seasonId = t.seasonId || '';
  if (!Array.isArray(t.players)) t.players = [];
  t.players.forEach(function(p){
    p.id = p.id || uid('pl');
    p.name = p.name || '未命名';
    p.uid = p.uid == null ? '' : String(p.uid);
    p.source = p.source || 'manual';
    p.tier = p.tier || '';
    p.withdrawn = !!p.withdrawn;
    p.disqualified = !!p.disqualified;
    p.note = p.note || '';
    p.seed = num(p.seed) || 0;
  });
  if (!Array.isArray(t.stages)) t.stages = [];
  t.stages.forEach(normalizeStage);
  t.result = t.result || { final: [], manual: null, points: {}, note: '' };
  if (!Array.isArray(t.result.final)) t.result.final = [];
  if (!Array.isArray(t.result.manual)) t.result.manual = null;
  if (!t.result.points || typeof t.result.points !== 'object') t.result.points = {};
  return t;
}
function normalizeStage(st){
  st.id = st.id || uid('st');
  st.format = (st.format === 'SINGLE' || st.format === 'DOUBLE') ? st.format : 'POINTS';
  st.name = st.name || defaultStageName(st.format);
  st.seats = num(st.seats) === 3 ? 3 : 4;
  st.roundCount = Math.max(1, Math.round(num(st.roundCount) || 1));
  st.halvesPerRound = Math.max(1, Math.round(num(st.halvesPerRound) || 1));
  st.status = st.status || 'pending';

  var p = st.pairing = st.pairing || {};
  p.mode = p.mode || 'RANDOM';
  if (!Array.isArray(p.chain) || !p.chain.length) p.chain = ['SWISS', 'LAYER'];
  p.seed = p.seed || 'PREV';
  p.layerSize = Math.max(2, Math.round(num(p.layerSize) || 4));
  p.avoidRepeat = p.avoidRepeat || 'soft';
  p.remainder = p.remainder || 'BYE';
  p.rrGroups = Math.max(1, Math.round(num(p.rrGroups) || 1));
  if (!p.roundOverride || typeof p.roundOverride !== 'object') p.roundOverride = {};

  var sc = st.scoring = st.scoring || {};
  sc.mode = sc.mode === 'PURE' ? 'PURE' : 'RANK_POINT';
  sc.rankSource = sc.rankSource === 'GLOBAL' ? 'GLOBAL' : 'TABLE';
  sc.rankBasis = sc.rankBasis === 'HAND' ? 'HAND' : 'ROUND';
  if (!sc.rankTable || typeof sc.rankTable !== 'object') sc.rankTable = { '4': [50, 10, -10, -30], '3': [30, 0, -30], '2': [15, -15] };
  ['4', '3', '2'].forEach(function(k){
    var arr = sc.rankTable[k];
    if (!Array.isArray(arr) || !arr.length){
      sc.rankTable[k] = k === '4' ? [50, 10, -10, -30] : (k === '3' ? [30, 0, -30] : [15, -15]);
    } else sc.rankTable[k] = arr.map(function(x){ return num(x); });
  });
  sc.tieSplit = sc.tieSplit !== false;
  sc.topBonus = Object.assign({ on: false, values: [15, 7.5, 5, 0] }, sc.topBonus || {});
  sc.water = Object.assign({ on: false, threshold: 0, plus: 0, minus: 0 }, sc.water || {});
  sc.entryMode = sc.entryMode === 'ADJUSTED' ? 'ADJUSTED' : 'RAW';
  sc.byePoint = num(sc.byePoint) || 0;
  sc.manual = sc.manual !== false;

  st.inherit = Object.assign({ mode: 'RESET', ratio: 1, includeRank: false }, st.inherit || {});
  st.inherit.mode = ['RESET', 'FULL', 'RATIO'].indexOf(st.inherit.mode) >= 0 ? st.inherit.mode : 'RESET';
  st.inherit.ratio = clamp(num(st.inherit.ratio) || 1, 0, 10);

  /* 阶段积分（赛季积分来源） */
  st.points = Object.assign({
    on: false, mode: 'TABLE',
    rankTable: [100, 80, 65, 50, 40, 30, 20, 10], beyond: 0,
    linear: { max: 50, min: 10 },
    special: { withdrawn: 10, dq: 0, unplayed: 0 },
    stack: true
  }, st.points || {});
  st.points.mode = st.points.mode === 'LINEAR' ? 'LINEAR' : 'TABLE';
  if (!Array.isArray(st.points.rankTable) || !st.points.rankTable.length){
    st.points.rankTable = [100, 80, 65, 50, 40, 30, 20, 10];
  } else st.points.rankTable = st.points.rankTable.map(function(x){ return num(x); });
  st.points.beyond = num(st.points.beyond) || 0;
  st.points.linear = Object.assign({ max: 50, min: 10 }, st.points.linear || {});
  st.points.special = Object.assign({ withdrawn: 10, dq: 0, unplayed: 0 }, st.points.special || {});
  st.points.stack = st.points.stack !== false;

  var tb = st.tiebreak = st.tiebreak || {};
  if (!Array.isArray(tb.chain) || !tb.chain.length){
    tb.chain = ['RAW', 'AVG_RANK', 'FIRST', 'SECOND', 'LAST', 'H2H', 'SEED'];
  }

  st.advance = Object.assign({ type: 'TOP_N', n: 16, min: 0 }, st.advance || {});
  st.advance.n = Math.max(0, Math.round(num(st.advance.n) || 0));
  st.elim = Object.assign({ perTable: 2, carry: false, grandFinal: 'TOPK' }, st.elim || {});
  st.elim.perTable = st.elim.perTable === 1 ? 1 : 2;

  if (!Array.isArray(st.rounds)) st.rounds = [];
  st.rounds.forEach(function(r){
    r.no = num(r.no) || 1;
    r.status = r.status === 'confirmed' ? 'confirmed' : 'open';
    if (!Array.isArray(r.tables)) r.tables = [];
    if (!Array.isArray(r.byes)) r.byes = [];
    if (!Array.isArray(r.adv)) r.adv = [];
    r.carryIn = r.carryIn || {};
    r.note = r.note || '';
    r.tables.forEach(function(tb){
      if (!Array.isArray(tb.seats)) tb.seats = [];
      tb.id = tb.id || uid('tb');
      tb.seats.forEach(function(s){
        s.pid = s.pid || '';
        if (!Array.isArray(s.scores)) s.scores = [];
        if (!Array.isArray(s.ranks)) s.ranks = [];
        while (s.scores.length < st.halvesPerRound) s.scores.push(0);
        while (s.ranks.length < st.halvesPerRound) s.ranks.push(0);
        s.scores.length = st.halvesPerRound;
        s.ranks.length = st.halvesPerRound;
        ['bonus','penalty','late','absent','carry'].forEach(function(k){ s[k] = num(s[k]) || 0; });
        s.note = s.note || '';
        if (s.manualRank === undefined) s.manualRank = null;
      });
    });
  });
  st.carryIn = st.carryIn || {};
  st.ranking = st.ranking || {};
  if (!Array.isArray(st.ranking.auto)) st.ranking.auto = [];
  if (st.ranking.manual !== null && !Array.isArray(st.ranking.manual)) st.ranking.manual = null;
  if (st.ranking.finalRanking !== null && !Array.isArray(st.ranking.finalRanking)) st.ranking.finalRanking = null;
  st.ranking.locked = !!st.ranking.locked;
  return st;
}

/* ---------- 取数据 ---------- */
function db(){ return DB; }
function getTournament(id){
  if (!DB) return null;
  for (var i = 0; i < DB.tournaments.length; i++) if (DB.tournaments[i].id === id) return DB.tournaments[i];
  return null;
}
function curTournament(){
  return APP.tid ? getTournament(APP.tid) : null;
}
function getStage(t, sid){
  if (!t) return null;
  for (var i = 0; i < t.stages.length; i++) if (t.stages[i].id === sid) return t.stages[i];
  return null;
}
function curStage(){
  var t = curTournament();
  return t ? getStage(t, APP.stageId) : null;
}
function getPlayer(t, pid){
  if (!t) return null;
  for (var i = 0; i < t.players.length; i++) if (t.players[i].id === pid) return t.players[i];
  return null;
}
function playerName(t, pid){
  var p = getPlayer(t, pid);
  return p ? p.name : '（未知选手）';
}
function activePlayers(t){
  return t.players.filter(function(p){ return !p.withdrawn && !p.disqualified; });
}
function stageIndex(t, sid){
  for (var i = 0; i < t.stages.length; i++) if (t.stages[i].id === sid) return i;
  return -1;
}
function prevStage(t, st){
  var i = stageIndex(t, st.id);
  return i > 0 ? t.stages[i - 1] : null;
}
function nextStage(t, st){
  var i = stageIndex(t, st.id);
  return i >= 0 && i < t.stages.length - 1 ? t.stages[i + 1] : null;
}
function stagePlayers(t, st){
  /* 该阶段参与者：首阶段=全部活跃选手；后续=上一阶段晋级者（advancers 存在 stage.entrants） */
  if (Array.isArray(st.entrants) && st.entrants.length) {
    return st.entrants.map(function(pid){ return getPlayer(t, pid); }).filter(Boolean);
  }
  var i = stageIndex(t, st.id);
  if (i <= 0) return activePlayers(t);
  var prev = t.stages[i - 1];
  var list = prev.advancers && prev.advancers.length ? prev.advancers : [];
  return list.map(function(pid){ return getPlayer(t, pid); }).filter(Boolean);
}
function stageActivePlayers(t, st){
  return stagePlayers(t, st).filter(function(p){ return !p.withdrawn && !p.disqualified; });
}
function getRound(st, no){
  if (!st) return null;
  for (var i = 0; i < st.rounds.length; i++) if (st.rounds[i].no === no) return st.rounds[i];
  return null;
}
function lastRound(st){ return st && st.rounds.length ? st.rounds[st.rounds.length - 1] : null; }
function openRound(st){
  for (var i = st.rounds.length - 1; i >= 0; i--) if (st.rounds[i].status !== 'confirmed') return st.rounds[i];
  return null;
}
function seatOfRound(r, pid){
  for (var i = 0; i < r.tables.length; i++){
    var tbs = r.tables[i].seats;
    for (var j = 0; j < tbs.length; j++) if (tbs[j].pid === pid) return { table: r.tables[i], tableIdx: i, seat: tbs[j], seatIdx: j };
  }
  return null;
}

/* ---------- 保存 ---------- */
var saveTimer = null;
function save(){
  if (!DB) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function(){ Store.save(DB); }, 100);
}
function saveNow(){
  if (!DB) return;
  clearTimeout(saveTimer);
  Store.save(DB);
}

/* ---------- 旧版数据迁移（好奇杯 curious_cup_data） ---------- */
function migrateOldData(old){
  var out = newDB();
  out.seenWelcome = true;
  var season = newSeason('默认赛季');
  season.id = 'se_default';
  out.seasons.push(season);
  out.activeSeasonId = season.id;
  (old.tournaments || []).forEach(function(ot){
    try { out.tournaments.push(migrateOldTournament(ot, season)); } catch(e){ console.error('迁移失败', ot && ot.name, e); }
  });
  return out;
}
function migrateOldTournament(ot, season){
  var t = newTournament(ot.name || '未命名赛事', season.id);
  t.id = ot.id || t.id;
  t.createdAt = num(ot.createdAt) || Date.now();
  t.status = ot.status === 'done' ? 'done' : 'ongoing';
  (ot.players || []).forEach(function(op){
    var p = newPlayer(op.name, { uid: op.playerUid, source: op.source || 'manual' });
    p.id = op.id || p.id;
    p.withdrawn = !!op.withdrawn;
    p.disqualified = !!op.disqualified;
    t.players.push(p);
  });
  var q = ot.qualifier || {};
  var stQ = newStage('POINTS', '资格赛');
  stQ.seats = 4;
  stQ.halvesPerRound = 2;
  stQ.roundCount = Math.max(1, (q.rounds || []).length || 3);
  stQ.advance = { type: 'TOP_N', n: 16, min: 0 };
  stQ.scoring.topBonus = { on: true, values: [15, 7.5, 5, 0] };
  stQ.tiebreak.chain = ['RAW', 'AVG_RANK', 'FIRST', 'SECOND', 'LAST', 'H2H', 'SEED'];
  (q.rounds || []).forEach(function(or){
    var r = defaultRound(num(or.roundNo) || (stQ.rounds.length + 1));
    r.status = or.confirmed ? 'confirmed' : 'open';
    (or.tables || []).forEach(function(otb){
      var tb = newTable([]);
      (otb.players || []).forEach(function(pid){
        if (!getPlayer(t, pid)) return;
        var s = defaultSeat(pid);
        var d = (otb.detail || {})[pid] || {};
        var halves = Math.max(2, (d.scores || []).length);
        stQ.halvesPerRound = Math.max(stQ.halvesPerRound, halves);
        s.scores = (d.scores || []).slice();
        s.ranks = (d.ranks || []).slice();
        s.bonus = num(d.special) + num(d.topBonus);
        s.penalty = num(d.penalty);
        s.late = num(d.late); s.absent = num(d.absent);
        tb.seats.push(s);
      });
      if (tb.seats.length) r.tables.push(tb);
    });
    stQ.rounds.push(r);
  });
  t.stages.push(stQ);

  var el = ot.elimination;
  if (el && (el.rounds || []).length){
    var stE = newStage('SINGLE', '淘汰赛');
    stE.seats = 4;
    stE.halvesPerRound = 3;
    stE.elim.perTable = 2;
    stE.roundCount = el.rounds.length;
    (el.rounds || []).forEach(function(or){
      var r = defaultRound(num(or.roundNo) || (stE.rounds.length + 1));
      r.status = or.confirmed ? 'confirmed' : 'open';
      r.adv = (or.advanced || []).slice();
      (or.tables || []).forEach(function(otb){
        var tb = newTable([]);
        (otb.players || []).forEach(function(pid){
          if (!getPlayer(t, pid)) return;
          var s = defaultSeat(pid);
          var d = (otb.detail || {})[pid] || {};
          s.scores = (d.scores || []).slice();
          s.ranks = (d.ranks || []).slice();
          s.bonus = num(d.special);
          s.penalty = num(d.penalty);
          s.late = num(d.late); s.absent = num(d.absent);
          tb.seats.push(s);
        });
        if (tb.seats.length) r.tables.push(tb);
      });
      stE.rounds.push(r);
    });
    t.stages.push(stE);
    if (Array.isArray(el.finalRanking)) t.result.final = el.finalRanking.slice();
  }
  if (q.corrections && typeof q.corrections === 'object'){
    stQ.ranking.fix = q.corrections;
  }
  return t;
}
