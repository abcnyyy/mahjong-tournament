'use strict';
/* =====================================================================
 * 05-elim.js  单败 / 双败淘汰
 * ===================================================================== */

/* 种子蛇形分桌：N 人、T 桌、S 座，返回 [[pid...]] */
function snakeTables(pids, seats){
  var n = pids.length, T = Math.ceil(n / seats);
  var tables = [];
  for (var i = 0; i < T; i++) tables.push([]);
  for (var r = 1; r <= n; r++){
    var k = Math.floor((r - 1) / T);
    var pos = (r - 1) % T;
    var ti = (k % 2 === 0) ? pos : (T - 1 - pos);
    if (ti < 0) ti = 0;
    if (ti >= T) ti = T - 1;
    tables[ti].push(pids[r - 1]);
  }
  return tables.filter(function(x){ return x.length; });
}

/* 本阶段参赛者（按上一阶段名次排序） */
function elimEntrants(t, st){
  var prev = prevStage(t, st);
  var list;
  if (prev){
    var rows = stageRanking(t, prev);
    var adv = prev.advancers && prev.advancers.length ? prev.advancers : rows.map(function(r){ return r.pid; });
    var byId = {};
    rows.forEach(function(r){ byId[r.pid] = r; });
    list = adv.slice().sort(function(a, b){
      var ra = byId[a], rb = byId[b];
      if (!ra) return 1;
      if (!rb) return -1;
      return ra.rank - rb.rank;
    });
  } else {
    list = stagePlayers(t, st).map(function(p){ return p.id; });
    if (st.pairing && st.pairing.seed === 'RANDOM') list = shuffle(list, hashStr(st.id));
    else {
      var rows0 = null;
      list = list.slice();
    }
  }
  /* 剔除退赛/DQ */
  list = list.filter(function(pid){
    var p = getPlayer(t, pid);
    return p && !p.disqualified && !p.withdrawn;
  });
  /* 不足人数时从其他活跃选手中补 */
  if (st.elim && st.elim.fillUp !== false){
    var inList = {};
    list.forEach(function(pid){ inList[pid] = 1; });
    activePlayers(t).forEach(function(p){ if (!inList[p.id]) list.push(p.id); });
  }
  return list;
}

/* 创建下一轮（单败 / 双败） */
function createElimRound(t, st){
  var seats = st.seats;
  var r = defaultRound(st.rounds.length + 1);
  var state = st.elimState;
  if (state && state.done) return null;
  if (!state){
    /* 第一轮 */
    var entrants = elimEntrants(t, st);
    state = st.elimState = {
      kind: st.format, winners: entrants.slice(), losers: [],
      initialLosers: Math.max(0, Math.min(num(st.elim.initialLosers) || 0, Math.max(0, entrants.length - seats))),
      wFinals: false, lFinals: false, gf: false, finalRanking: null, done: false
    };
    if (state.initialLosers > 0){
      state.losers = state.winners.splice(state.winners.length - state.initialLosers);
    }
  }
  if (st.format === 'SINGLE'){
    if (!state.winners.length) return null;
    r.type = 'K';
    r.pool = state.winners.slice();
    r.tables = makeElimTables(state.winners, seats, r.no);
  } else {
    var type = pickElimType(st, state);
    if (!type) { state.done = true; return null; }
    r.type = type;
    if (type === 'W'){
      r.pool = state.winners.slice();
      r.tables = makeElimTables(state.winners, seats, r.no);
    } else if (type === 'L'){
      r.pool = state.losers.slice();
      r.tables = makeElimTables(state.losers, seats, r.no);
    } else if (type === 'WF'){
      r.pool = state.winners.slice();
      r.tables = makeElimTables(state.winners, seats, r.no);
    } else if (type === 'LF'){
      r.pool = state.losers.slice();
      r.tables = makeElimTables(state.losers, seats, r.no);
    } else if (type === 'GF'){
      var parts = (state.gfPool || []).slice();
      r.pool = parts;
      r.tables = [newTable([])];
      parts.forEach(function(pid){ r.tables[0].seats.push(defaultSeat(pid)); });
    }
  }
  return r;
}
function pickElimType(st, state){
  if (state.done) return null;
  if (state.wFinals && state.lFinals){
    if (!state.gfDone) return 'GF';
    return null;
  }
  if (!state.wFinals){
    if (state.winners.length > st.seats) return 'W';
    state.wFinals = true;
    return 'WF';
  }
  if (!state.lFinals){
    if (state.losers.length > st.seats) return 'L';
    state.lFinals = true;
    return 'LF';
  }
  return null;
}
function makeElimTables(pids, seats, roundNo){
  var groups = snakeTables(pids, seats);
  return groups.map(function(g){
    var tb = newTable([]);
    /* 桌面内按种子顺序轮转座位，避免总是同一人坐同方位 */
    var rot = (roundNo - 1) % Math.max(1, g.length);
    var ordered = g.slice(rot).concat(g.slice(0, rot));
    ordered.forEach(function(pid){ tb.seats.push(defaultSeat(pid)); });
    return tb;
  });
}

/* 确认一轮淘汰赛：算出晋级/落败 */
function confirmElimRound(t, st, r){
  if (r.status === 'confirmed') return;
  var halves = st.halvesPerRound;
  var adv = [];
  var tableResults = [];
  r.tables.forEach(function(tb, ti){
    var rows = calcRound(st, r)[ti].rows.slice().sort(function(a, b){ return a.rank - b.rank; });
    var k = st.elim.perTable;
    var tableAdv = [], tableOut = [];
    rows.forEach(function(x, i){
      var p = getPlayer(t, x.pid);
      if (!p) return;
      if (p.disqualified){ tableOut.push(x.pid); return; }
      if (i < k && !p.withdrawn) tableAdv.push(x.pid);
      else tableOut.push(x.pid);
    });
    /* 递补：本桌晋级者退赛/DQ 时，用同桌后面名次补 */
    while (tableAdv.length < k){
      var cand = rows.filter(function(x){
        return tableAdv.indexOf(x.pid) < 0 && tableOut.indexOf(x.pid) >= 0 && !(getPlayer(t, x.pid) || {}).disqualified;
      })[0];
      if (!cand) break;
      tableAdv.push(cand.pid);
      tableOut = tableOut.filter(function(p){ return p !== cand.pid; });
    }
    tableResults.push({ adv: tableAdv, out: tableOut });
    adv = adv.concat(tableAdv);
  });
  r.adv = adv;
  r.results = tableResults;

  if (st.format === 'SINGLE'){
    st.elimState.winners = adv.slice();
    /* 只剩一张桌 = 决赛，打完即结束 */
    if (r.tables.length <= 1) st.elimState.done = true;
    else if (adv.length <= st.seats) st.elimState.wFinals = true;
  } else {
    var state = st.elimState;
    if (r.type === 'W' || r.type === 'WF'){
      var dropped = [];
      tableResults.forEach(function(tr){ dropped = dropped.concat(tr.out); });
      state.winners = adv.slice();
      state.losers = state.losers.concat(dropped);
      if (r.type === 'WF'){
        /* 胜者组决赛：胜者组冠军进总决赛 */
        state.wChamp = tableResults[0].adv[0];
      }
    } else if (r.type === 'L' || r.type === 'LF'){
      state.losers = adv.slice();
      if (r.type === 'LF'){
        state.lChamp = tableResults[0].adv[0];
      }
    } else if (r.type === 'GF'){
      state.gfDone = true;
      state.done = true;
    }
    if (!state.gf && state.wFinals && state.lFinals){
      state.gf = true;
      state.gfPool = buildGrandFinalPool(t, st);
      state.gfDone = false;
    }
  }
  r.status = 'confirmed';
  if (st.format === 'SINGLE' && st.elimState.done !== true && adv.length <= 1) st.elimState.done = true;
  st.status = 'active';
  return adv;
}

/* 总决赛：胜者组决赛桌前 perTable 名 + 败者组决赛桌前 (seats-perTable) 名 */
function buildGrandFinalPool(t, st){
  var pool = [];
  var state = st.elimState;
  var wf = null, lf = null;
  st.rounds.forEach(function(r){
    if (r.type === 'WF' && r.status === 'confirmed') wf = r;
    if (r.type === 'LF' && r.status === 'confirmed') lf = r;
  });
  var k = st.elim.grandFinal === 'CHAMPIONS' ? 1 : st.elim.perTable;
  var seats = st.seats;
  function topOf(r, n){
    if (!r) return [];
    var rows = calcRound(st, r)[0].rows.slice().sort(function(a, b){ return a.rank - b.rank; });
    return rows.map(function(x){ return x.pid; }).slice(0, n);
  }
  var w = topOf(wf, k);
  var l = topOf(lf, Math.max(1, seats - w.length));
  if (st.elim.grandFinal === 'CHAMPIONS') l = l.slice(0, 1);
  pool = w.concat(l);
  pool = uniq(pool);
  while (pool.length < seats){
    /* 不足时用败者组决赛桌剩余名次补 */
    var restC = topOf(lf, seats).filter(function(p){ return pool.indexOf(p) < 0; });
    if (!restC.length) break;
    pool.push(restC[0]);
  }
  return pool.slice(0, seats);
}

/* 淘汰赛最终排名 */
function elimFinalRanking(t, st){
  var state = st.elimState || {};
  var seats = st.seats;
  var placed = [], seen = {};
  function add(pid){
    if (!pid || seen[pid]) return;
    var p = getPlayer(t, pid);
    if (!p || p.disqualified) return;
    seen[pid] = 1; placed.push(pid);
  }
  var rounds = st.rounds.filter(function(r){ return r.status === 'confirmed'; });
  if (!rounds.length) return [];
  if (st.format === 'SINGLE'){
    for (var i = rounds.length - 1; i >= 0; i--){
      var r = rounds[i];
      var res = r.results || [];
      if (i === rounds.length - 1){
        var rowsF = calcRound(st, r)[0].rows.slice().sort(function(a, b){ return a.rank - b.rank; });
        rowsF.forEach(function(x){ add(x.pid); });
      } else {
        var advSet = {};
        (r.adv || []).forEach(function(pid){ advSet[pid] = 1; });
        var outRows = [];
        (r.results || []).forEach(function(tr, ti){
          var rows = calcRound(st, r)[ti].rows.slice().sort(function(a, b){ return a.rank - b.rank; });
          rows.forEach(function(x){ if (!advSet[x.pid]) outRows.push({ pid: x.pid, rank: x.rank }); });
        });
        outRows.sort(function(a, b){ return a.rank - b.rank; });
        outRows.forEach(function(x){ add(x.pid); });
      }
    }
  } else {
    /* 双败：总决赛 → 败者组决赛出局者 → 各败者组轮出局者（胜者组掉下来的还在败者组里） */
    var gf = rounds.filter(function(r){ return r.type === 'GF'; })[0];
    var lf = rounds.filter(function(r){ return r.type === 'LF'; })[0];
    if (gf){
      var gRows = calcRound(st, gf)[0].rows.slice().sort(function(a, b){ return a.rank - b.rank; });
      gRows.forEach(function(x){ add(x.pid); });
    }
    if (lf){
      var gfSet = {};
      ((gf && gf.pool) || []).forEach(function(pid){ gfSet[pid] = 1; });
      var lRows = calcRound(st, lf)[0].rows.slice().sort(function(a, b){ return a.rank - b.rank; });
      lRows.forEach(function(x){ if (!gfSet[x.pid]) add(x.pid); });
    }
    var lRounds = rounds.filter(function(r){ return r.type === 'L'; });
    for (var j = lRounds.length - 1; j >= 0; j--){
      var rr = lRounds[j];
      var advAll = {};
      (rr.adv || []).forEach(function(pid){ advAll[pid] = 1; });
      var tmp = [];
      (rr.results || []).forEach(function(tr, ti){
        var rows = calcRound(st, rr)[ti].rows.slice().sort(function(a, b){ return a.rank - b.rank; });
        rows.forEach(function(x){ if (!advAll[x.pid]) tmp.push({ pid: x.pid, rank: x.rank }); });
      });
      tmp.sort(function(a, b){ return a.rank - b.rank; });
      tmp.forEach(function(x){ add(x.pid); });
    }
  }
  /* 兜底：未出现的活跃选手 */
  stagePlayers(t, st).forEach(function(p){ if (!seen[p.id]) add(p.id); });
  return placed;
}
