'use strict';
/* =====================================================================
 * 04-scoring.js  登分计算 / 排名 / 破同分 / 晋级
 * ===================================================================== */

/* ---------- 单桌单轮 ---------- */
function seatTotals(seat, halves){
  var raw = 0, i;
  for (i = 0; i < halves; i++) raw += num(seat.scores[i]);
  var base = raw + num(seat.bonus) - num(seat.penalty) + num(seat.carry);
  return { raw: raw, base: base };
}
/* 每桌本轮总分（含加扣分，不含传承分） */
function roundTableTotals(tb, halves){
  return tb.seats.map(function(s){
    var r = seatTotals(s, halves);
    return { pid: s.pid, total: r.base, raw: r.raw };
  });
}
/* 桌内排名（1..n），并列取同名次；returns {pid: rank} */
function tableRanks(list){
  var sorted = list.slice().sort(function(a, b){ return b.total - a.total; });
  var map = {}, lastTotal = null, lastRank = 0;
  sorted.forEach(function(x, i){
    var rk = (lastTotal !== null && x.total === lastTotal) ? lastRank : i + 1;
    lastTotal = x.total; lastRank = rk;
    map[x.pid] = rk;
  });
  return map;
}
/* 并列名次分平分：rank 相同者平分其占用的名次档位 */
function rankPointsWithTie(totals, table, tieSplit){
  var sorted = totals.slice().sort(function(a, b){ return b.total - a.total; });
  var out = {}, i = 0;
  while (i < sorted.length){
    var j = i;
    while (j + 1 < sorted.length && sorted[j + 1].total === sorted[i].total) j++;
    var cnt = j - i + 1;
    if (tieSplit && cnt > 1){
      var s = 0;
      for (var k = i; k <= j; k++) s += num(table[k]) ; // 取连续档位
      var avg = s / cnt;
      for (var q = i; q <= j; q++) out[sorted[q].pid] = avg;
    } else {
      for (var q2 = i; q2 <= j; q2++) out[sorted[q2].pid] = num(table[i]);
    }
    i = j + 1;
  }
  return out;
}
function clampTable(t, idx){
  if (!t || !t.length) return 0;
  return num(t[Math.min(idx, t.length - 1)]);
}
/* 按人数与正负分取名次分表：sign = 'neg' 用负分表，否则正分表 */
function rankTableFor(cfg, n, sign){
  var src = (sign === 'neg' && cfg.rankTableNeg) ? cfg.rankTableNeg : cfg.rankTable;
  var key = String(n);
  var t = src[key];
  if (Array.isArray(t) && t.length) return t;
  var base = src['4'] || [50, 10, -10, -30];
  if (n < 4) return base.slice(0, n);
  var ext = base.slice();
  while (ext.length < n) ext.push(ext[ext.length - 1]);
  return ext;
}
function tableOfSize(cfg, n){ return rankTableFor(cfg, n, 'pos'); }
/* 按桌上正分人数 k 选表 */
function rankTableByCount(cfg, n, k){
  var list = (cfg.rankTableByCount || {})[String(n)];
  if (Array.isArray(list) && Array.isArray(list[k]) && list[k].length) return list[k];
  return rankTableFor(cfg, n, 'pos');
}
/* 名次分：每个选手按自己的原始点数正负选择正/负分表；并列时平分档位 */
function rankPointsBySign(entries, cfg, isNeg){
  var sorted = entries.slice().sort(function(a, b){ return b.total - a.total; });
  var out = {}, i = 0;
  while (i < sorted.length){
    var j = i;
    while (j + 1 < sorted.length && sorted[j + 1].total === sorted[i].total) j++;
    var cnt = j - i + 1;
    for (var q = i; q <= j; q++){
      var e = sorted[q];
      var table = rankTableFor(cfg, sorted.length, isNeg(e) ? 'neg' : 'pos');
      if (cfg.tieSplit && cnt > 1){
        var s = 0;
        for (var k = i; k <= j; k++) s += clampTable(table, k);
        out[e.pid] = s / cnt;
      } else {
        out[e.pid] = clampTable(table, i);
      }
    }
    i = j + 1;
  }
  return out;
}

/* ---------- 单轮计算（写回 _calc，不持久化成依赖） ---------- */
function calcRound(st, r){
  var cfg = st.scoring, halves = st.halvesPerRound;
  var perTable = [];
  r.tables.forEach(function(tb){
    var totals = roundTableTotals(tb, halves);
    var pts;
    if (cfg.rankTableMode === 'POSCOUNT'){
      var kPosRound = totals.filter(function(x){ return num(x.raw) >= 0; }).length;
      pts = rankPointsWithTie(totals, rankTableByCount(cfg, totals.length, kPosRound), cfg.tieSplit);
    } else {
      pts = rankPointsBySign(totals, cfg, function(e){ return num(e.raw) < 0; });
    }
    /* 名次分：每轮 / 每局 两个开关可同时启用，分别累加 */
    var handPts = {};
    if (cfg.rankBasisHand){
      for (var hh = 0; hh < halves; hh++){
        var hTotals = tb.seats.map(function(s){ return { pid: s.pid, total: num(s.scores[hh]), raw: num(s.scores[hh]) }; });
        var hp;
        if (cfg.rankTableMode === 'POSCOUNT'){
          var kPosHand = hTotals.filter(function(x){ return num(x.raw) >= 0; }).length;
          hp = rankPointsWithTie(hTotals, rankTableByCount(cfg, hTotals.length, kPosHand), cfg.tieSplit);
        } else {
          hp = rankPointsBySign(hTotals, cfg, function(e){ return num(e.raw) < 0; });
        }
        Object.keys(hp).forEach(function(pid){ handPts[pid] = (handPts[pid] || 0) + hp[pid]; });
      }
    }
    var ranks = tableRanks(totals);
    var maxTotal = -Infinity, maxCnt = 0;
    totals.forEach(function(x){ if (x.total > maxTotal){ maxTotal = x.total; maxCnt = 1; } else if (x.total === maxTotal) maxCnt++; });
    var rows = tb.seats.map(function(s){
      var tot = totals.filter(function(x){ return x.pid === s.pid; })[0] || { total: 0, raw: 0 };
      var rank = s.manualRank ? num(s.manualRank) : (ranks[s.pid] || totals.length);
      var rankPointRound = cfg.rankBasisRound ? num(pts[s.pid]) : 0;
      var rankPointHand = cfg.rankBasisHand ? (handPts[s.pid] || 0) : 0;
      var rankPoint = rankPointRound + rankPointHand;
      /* 水上/水下修正 */
      var water = 0;
      if (cfg.water && cfg.water.on){
        if (tot.total >= num(cfg.water.high)) water += num(cfg.water.highAdd);
        else if (tot.total <= num(cfg.water.low)) water += num(cfg.water.lowAdd);
      }
      /* top 加分 */
      var topBonus = 0;
      if (cfg.topBonus && cfg.topBonus.on){
        var vals = cfg.topBonus.values || [15, 7.5, 5, 0];
        topBonus = (tot.total === maxTotal) ? num(vals[Math.min(maxCnt - 1, vals.length - 1)]) : 0;
      }
      var roundPoint = 0;
      /* 小分 = 纯原始点数（各局点数之和），不含任何修正 */
      var rawValue = tot.raw;
      if (cfg.mode === 'RANK_POINT'){
        roundPoint = rankPoint + topBonus + water + num(s.bonus) - num(s.penalty);
      } else if (cfg.entryMode === 'ADJUSTED'){
        /* 录入口径 = 已含名次修正的点数；反推出纯原始点数作为小分 */
        rawValue = tot.raw - rankPoint;
        roundPoint = tot.total + topBonus + water;
      } else {
        roundPoint = tot.total + (cfg.useRankTable === false ? 0 : rankPoint) + topBonus + water;
      }
      return {
        pid: s.pid, rank: rank, rankPoint: rankPoint, rankPointRound: rankPointRound, rankPointHand: rankPointHand,
        total: tot.total, raw: rawValue,
        topBonus: topBonus, water: water, point: roundPoint, bonus: num(s.bonus), penalty: num(s.penalty)
      };
    });
    perTable.push({ tableId: tb.id, rows: rows, maxTotal: maxTotal });
  });
  return perTable;
}

/* ---------- 阶段累计排名 ---------- */
function computeStage(t, st){
  var cfg = st.scoring, halves = st.halvesPerRound;
  var map = {};
  function row(pid){
    if (!map[pid]) map[pid] = {
      pid: pid, point: 0, raw: 0, rankPoint: 0, topBonus: 0, water: 0,
      bonus: 0, penalty: 0, rounds: {}, games: 0, first: 0, second: 0, third: 0, fourth: 0,
      last: 0, sumRank: 0, rankGames: 0, sumRoundRank: 0, roundRankGames: 0,
      byes: 0, late: 0, absent: 0, carry: 0, meetings: {}
    };
    return map[pid];
  }
  /* 参赛者先建行 */
  stagePlayers(t, st).forEach(function(p){ row(p.id); });
  var history = {};   /* 直接对局记录 pid -> {oppPid: [胜,负]} */

  st.rounds.forEach(function(r){
    if (r.status === 'void') return;
    var calc = calcRound(st, r);
    var roundTableMap = {};
    calc.forEach(function(tc, ti){
      var tb = r.tables[ti];
      var pids = [];
      tc.rows.forEach(function(x){
        var m = row(x.pid);
        m.rounds[r.no] = (m.rounds[r.no] || 0) + x.point;
        m.point += x.point;
        m.raw += x.raw;
        m.rankPoint += x.rankPoint;
        m.topBonus += x.topBonus;
        m.water += x.water;
        m.bonus += x.bonus;
        m.penalty += x.penalty;
        /* 顺位统计按「每局」，没有录每局顺位时退化为本轮顺位 */
        var seat = null;
        tb.seats.forEach(function(s){ if (s.pid === x.pid) seat = s; });
        m.sumRoundRank += x.rank; m.roundRankGames++;
        for (var h = 0; h < halves; h++){
          var rk = seat ? (num(seat.ranks[h]) || x.rank) : x.rank;
          m.sumRank += rk; m.rankGames++;
          if (rk === 1) m.first++;
          else if (rk === 2) m.second++;
          else if (rk === 3) m.third++;
          else if (rk >= 4) { m.fourth++; if (rk === tb.seats.length) m.last++; }
        }
        pids.push(x.pid);
      });
      pids.forEach(function(a){
        pids.forEach(function(b){
          if (a === b) return;
          var ma = map[a], mb = map[b];
          if (!ma || !mb) return;
          /* 用本轮桌内排名判定胜负 */
          var ra = tc.rows.filter(function(x){ return x.pid === a; })[0];
          var rb = tc.rows.filter(function(x){ return x.pid === b; })[0];
          if (!ra || !rb) return;
          ma.meetings[b] = ma.meetings[b] || { w: 0, l: 0, t: 0 };
          mb.meetings[a] = mb.meetings[a] || { w: 0, l: 0, t: 0 };
          if (ra.rank < rb.rank){ ma.meetings[b].w++; mb.meetings[a].l++; }
          else if (ra.rank > rb.rank){ ma.meetings[b].l++; mb.meetings[a].w++; }
          else { ma.meetings[b].t++; mb.meetings[a].t++; }
        });
      });
    });
    r.tables.forEach(function(tb){
      tb.seats.forEach(function(s){
        var m = map[s.pid];
        if (!m) return;
        m.games++;
        m.late += num(s.late); m.absent += num(s.absent);
      });
    });
    (r.byes || []).forEach(function(pid){
      var m = map[pid];
      if (m){
        m.byes++;
        m.point += num(cfg.byePoint) || 0;
        m.rounds[r.no] = (m.rounds[r.no] || 0) + (num(cfg.byePoint) || 0);
      }
    });
  });

  /* 传承分 */
  stagePlayers(t, st).forEach(function(p){
    var m = map[p.id];
    if (!m) return;
    m.carry = num(st.carryIn[p.id]) || 0;
    m.point += m.carry;
    m.avgRank = m.rankGames ? m.sumRank / m.rankGames : 99;
    if (st.ranking && st.ranking.fix && st.ranking.fix[p.id] != null){
      m.fix = num(st.ranking.fix[p.id]);
      m.point += m.fix;
    } else m.fix = 0;
  });

  var rows = Object.keys(map).map(function(k){ return map[k]; });
  rows.forEach(function(m){
    var p = getPlayer(t, m.pid);
    m.withdrawn = !!(p && p.withdrawn);
    m.disqualified = !!(p && p.disqualified);
    m.seed = p ? (num(p.seed) || 0) : 0;
  });
  rows.sort(function(a, b){ return compareRows(a, b, st); });
  return { rows: rows, order: rows.map(function(m){ return m.pid; }) };
}

function hasAnyScore(r, pid, halves){
  var found = false;
  r.tables.forEach(function(tb){
    tb.seats.forEach(function(s){
      if (s.pid !== pid) return;
      for (var i = 0; i < halves; i++){ if (num(s.scores[i]) || num(s.ranks[i])) found = true; }
      if (num(s.bonus) || num(s.penalty)) found = true;
    });
  });
  return found;
}

/* ---------- 破同分比较 ---------- */
var TIEBREAK_LABEL = {
  POINT: '积分', RAW: '总原始分', AVG_RANK: '每局均顺位', FIRST: '一位数', SECOND: '二位数',
  THIRD: '三位数', LAST: '垫底数', FIRST_RATE: '一位率', LAST_RATE: '垫底率',
  SUM_RANK: '每局顺位总和', AVG_ROUND_RANK: '每轮均顺位',
  H2H: '直接对局', SEED: '报名种子', BYE: '轮空数', RANDOM: '抽签'
};
function compareRows(a, b, st){
  var d = b.point - a.point;
  if (Math.abs(d) > 1e-9) return d;
  var chain = (st.tiebreak && st.tiebreak.chain) || [];
  for (var i = 0; i < chain.length; i++){
    var r = compareByKey(a, b, chain[i], st);
    if (r) return r;
  }
  return hashStr(a.pid) - hashStr(b.pid);
}
function compareByKey(a, b, key, st){
  function cmpNum(x, y, desc){ if (Math.abs(x - y) < 1e-9) return 0; return desc ? (y - x) : (x - y); }
  switch (key){
    case 'POINT': return cmpNum(a.point, b.point, true);
    case 'RAW': return cmpNum(a.raw, b.raw, true);
    case 'AVG_RANK': return cmpNum(a.avgRank, b.avgRank, false);
    case 'SUM_RANK': return cmpNum(a.sumRank, b.sumRank, false);
    case 'AVG_ROUND_RANK': return cmpNum(a.roundRankGames ? a.sumRoundRank / a.roundRankGames : 99,
                                        b.roundRankGames ? b.sumRoundRank / b.roundRankGames : 99, false);
    case 'FIRST': return cmpNum(a.first, b.first, true);
    case 'SECOND': return cmpNum(a.second, b.second, true);
    case 'THIRD': return cmpNum(a.third, b.third, true);
    case 'LAST': return cmpNum(a.last, b.last, false);
    case 'FIRST_RATE': return cmpNum(a.first / (a.games || 1), b.first / (b.games || 1), true);
    case 'LAST_RATE': return cmpNum(a.last / (a.games || 1), b.last / (b.games || 1), false);
    case 'BYE': return cmpNum(a.byes, b.byes, true);
    case 'SEED': return cmpNum(a.seed, b.seed, false);
    case 'H2H': {
      var ma = a.meetings && a.meetings[b.pid] || { w: 0, l: 0, t: 0 };
      return cmpNum(ma.w, ma.l, true);
    }
    case 'RANDOM': return hashStr(a.pid) - hashStr(b.pid);
    default: return 0;
  }
}
/* 退赛/DQ 沉底（可选）：锁定后排序 */
function sortWithStatus(rows, st){
  rows.sort(function(a, b){
    var ba = a.disqualified ? 2 : (a.withdrawn ? 1 : 0);
    var bb = b.disqualified ? 2 : (b.withdrawn ? 1 : 0);
    if (ba !== bb) return ba - bb;
    return compareRows(a, b, st);
  });
  return rows;
}

/* ---------- 晋级 ---------- */
function computeAdvancers(t, st, rankedRows){
  var rows = (rankedRows || computeStage(t, st).rows).filter(function(r){ return !r.disqualified; });
  var rule = st.advance || { type: 'TOP_N', n: 16 };
  var picked = [];
  if (rule.type === 'MIN_POINT'){
    picked = rows.filter(function(r){ return r.point >= num(rule.min); });
  } else if (rule.type === 'BOTH'){
    var byPoint = rows.filter(function(r){ return r.point >= num(rule.min); });
    var ids = {};
    byPoint.forEach(function(r){ ids[r.pid] = 1; });
    var ordered = rows.filter(function(r){ return ids[r.pid]; });
    for (var i = 0; i < rows.length && ordered.length < num(rule.n); i++){
      if (!ids[rows[i].pid]){ ordered.push(rows[i]); ids[rows[i].pid] = 1; }
    }
    picked = ordered;
  } else {
    picked = rows.slice(0, Math.max(0, num(rule.n)));
  }
  return picked.map(function(r){ return r.pid; });
}

/* ---------- 阶段成绩：给界面用 ---------- */
function stageRanking(t, st){
  var res = computeStage(t, st);
  var rows = res.rows;
  var manual = st.ranking && st.ranking.manual;
  if (Array.isArray(manual) && manual.length){
    var byId = {}, out = [], seen = {};
    rows.forEach(function(r){ byId[r.pid] = r; });
    manual.forEach(function(pid){
      if (byId[pid] && !seen[pid]){ seen[pid] = 1; out.push(byId[pid]); }
    });
    rows.forEach(function(r){ if (!seen[r.pid]) out.push(r); });
    /* 手动顺序优先，只把退赛/DQ 沉底 */
    var norm = [], wd = [], dq = [];
    out.forEach(function(r){ (r.disqualified ? dq : (r.withdrawn ? wd : norm)).push(r); });
    rows = norm.concat(wd, dq);
  } else {
    rows = sortWithStatus(rows, st);
  }
  rows.forEach(function(r, i){ r.rank = i + 1; });
  return rows;
}
function stageFixMap(st){ return (st.ranking && st.ranking.fix) || {}; }
function setStageFix(st, pid, v){
  st.ranking.fix = st.ranking.fix || {};
  if (v === '' || v == null || isNaN(parseFloat(v))) delete st.ranking.fix[pid];
  else st.ranking.fix[pid] = num(v);
}
/* 平均顺位 */
function avgRankOf(m){ return m.rankGames ? m.sumRank / m.rankGames : 0; }
