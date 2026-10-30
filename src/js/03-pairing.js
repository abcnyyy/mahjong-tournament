'use strict';
/* =====================================================================
 * 03-pairing.js  分桌编排：随机 / 高高碰 / 分层抽签 / 分档抽签 / 循环赛 / 按名次
 * ===================================================================== */

var PAIR_MODES = {
  RANDOM: '随机抽签',
  SWISS: '高高碰（按积分）',
  LAYER: '分层抽签',
  TIER: '分档抽签',
  RR: '循环赛',
  PREV: '按上轮名次'
};

/* 已发生的同桌历史（当前阶段，轮次 < beforeNo 的所有桌） */
function pairHistory(st, beforeNo){
  var set = {};
  st.rounds.forEach(function(r){
    if (beforeNo != null && r.no >= beforeNo) return;
    r.tables.forEach(function(tb){
      var ps = tb.seats.map(function(s){ return s.pid; }).filter(Boolean);
      for (var i = 0; i < ps.length; i++)
        for (var j = i + 1; j < ps.length; j++) set[pairKey(ps[i], ps[j])] = (set[pairKey(ps[i], ps[j])] || 0) + 1;
    });
  });
  return set;
}

/* 组合枚举 */
function forEachCombo(arr, k, cb){
  var idx = [];
  (function rec(start, depth){
    if (depth === k){ cb(idx.map(function(i){ return arr[i]; })); return; }
    for (var i = start; i < arr.length; i++){ idx[depth] = i; rec(i + 1, depth + 1); }
  })(0, 0);
}

/* 桌成本：[重复次数, 分差] */
function pairCost(group, hist){
  var rep = 0;
  for (var i = 0; i < group.length; i++)
    for (var j = i + 1; j < group.length; j++){
      if (hist[pairKey(group[i].pid, group[j].pid)]) rep++;
    }
  var pts = group.map(function(p){ return p.points || 0; });
  var spread = Math.max.apply(null, pts) - Math.min.apply(null, pts);
  return { rep: rep, spread: spread };
}
function costLess(a, b, wSpread){
  if (!b) return true;
  if (wSpread){
    if (a.rep !== b.rep) return a.rep < b.rep;
    return a.spread < b.spread;
  }
  if (a.rep !== b.rep) return a.rep < b.rep;
  return a.spread < b.spread;
}

/* 高高碰：锚点 + 滑动窗口 */
function swissGroup(pool, seats, hist, avoidRepeat, windowSize){
  var win = Math.max(seats, Math.min(windowSize || 12, pool.length));
  var anchor = pool[0];
  var rest = pool.slice(1, win);
  var best = null, bestScore = null;
  forEachCombo(rest, seats - 1, function(combo){
    var g = [anchor].concat(combo);
    var c = pairCost(g, hist);
    if (costLess(c, bestScore, avoidRepeat !== 'off')){ bestScore = c; best = g; }
  });
  if (!best){
    /* 池子不够凑一桌，尽量取 */
    best = pool.slice(0, seats);
    return best;
  }
  if (avoidRepeat !== 'off' && bestScore.rep > 0){
    /* 扩大窗口重搜，优先不重复 */
    var wide = pool.slice(1, Math.min(pool.length, win * 3));
    var best2 = null, sc2 = null;
    forEachCombo(wide, seats - 1, function(combo){
      var g2 = [anchor].concat(combo);   /* eslint-disable-line */
      var c2 = pairCost(g2, hist);
      if (costLess(c2, sc2, true)){ sc2 = c2; best2 = g2; }
    });
    if (best2 && sc2.rep < bestScore.rep) best = best2;
  }
  return best;
}

/* 主入口：根据 pool（已排序 [{pid,points,tier}]）生成桌 */
function makeTables(pool, seats, cfg, hist){
  hist = hist || {};
  var avoid = cfg.avoidRepeat || 'soft';
  var mode = cfg.mode || 'RANDOM';
  var out = [];
  if (!pool.length) return out;

  if (mode === 'RANDOM'){
    var shuffled = shuffle(pool, cfg._seed);
    var i;
    for (i = 0; i + seats <= shuffled.length; i += seats) out.push(shuffled.slice(i, i + seats));
    if (i < shuffled.length) out.push(shuffled.slice(i));
    return out;
  }

  if (mode === 'PREV' || mode === 'SWISS'){
    var restPool = pool.slice();
    var guard = 0;
    while (restPool.length >= seats && guard++ < 500){
      var g;
      if (mode === 'PREV'){
        /* 按名次连续成桌（蛇形，避免首轮就有明显强弱差） */
        g = restPool.splice(0, seats);
      } else {
        g = swissGroup(restPool, seats, hist, avoid, cfg.windowSize);
        g.forEach(function(p){ var k = restPool.indexOf(p); if (k >= 0) restPool.splice(k, 1); });
      }
      out.push(g);
    }
    if (restPool.length) out.push(restPool);
    return out;
  }

  if (mode === 'LAYER'){
    var size = Math.max(2, num(cfg.layerSize) || seats);
    var nTables = Math.ceil(pool.length / seats);
    var buckets = [];
    var list = pool.slice();
    for (var b = 0; b < list.length; b += size) buckets.push(shuffle(list.slice(b, b + size), (cfg._seed || 1) + b));
    var tables = [];
    for (var ti = 0; ti < nTables; ti++) tables.push([]);
    buckets.forEach(function(layer, li){
      layer.forEach(function(p, pi){
        tables[(pi + li) % nTables].push(p);
      });
    });
    tables.forEach(function(tb){ if (tb.length) out.push(tb); });
    return balanceTables(out, seats);
  }

  if (mode === 'TIER'){
    var byTier = {}, order = [];
    pool.forEach(function(p){
      var k = p.tier || '未分档';
      if (!byTier[k]){ byTier[k] = []; order.push(k); }
      byTier[k].push(p);
    });
    order.sort(function(a, b){ return a < b ? -1 : 1; });
    var nT = Math.ceil(pool.length / seats);
    var tbs = [];
    for (var x = 0; x < nT; x++) tbs.push([]);
    order.forEach(function(k, ki){
      var arr = shuffle(byTier[k], (cfg._seed || 7) + ki);
      arr.forEach(function(p, pi){ tbs[(pi + ki) % nT].push(p); });
    });
    tbs.forEach(function(tb){ if (tb.length) out.push(tb); });
    return balanceTables(out, seats);
  }

  if (mode === 'RR'){
    return roundRobinTables(pool, seats, cfg, hist);
  }
  return makeTables(pool, seats, { mode: 'RANDOM', _seed: cfg._seed }, hist);
}

/* 循环赛：每轮人人出赛，优先安排「没同桌过」的人一桌；每轮旋转起始点保证轮转 */
function roundRobinTables(pool, seats, cfg, hist){
  var list = pool.slice();
  var n = list.length;
  if (!n) return [];
  var groups = Math.max(1, Math.min(num(cfg.rrGroups) || 1, Math.floor(n / seats) || 1));
  var perGroup = Math.ceil(n / groups);
  var roundNo = num(cfg._roundNo) || 1;
  var out = [];
  var localHist = {};
  Object.keys(hist || {}).forEach(function(k){ localHist[k] = hist[k]; });
  function markTable(g){
    for (var i = 0; i < g.length; i++)
      for (var j = i + 1; j < g.length; j++){
        var k = pairKey(g[i].pid, g[j].pid);
        localHist[k] = (localHist[k] || 0) + 1;
      }
  }
  for (var gi = 0; gi < groups; gi++){
    var part = list.slice(gi * perGroup, (gi + 1) * perGroup);
    if (!part.length) continue;
    var rot = (roundNo * seats) % part.length;
    var remain = part.slice(rot).concat(part.slice(0, rot));
    while (remain.length >= seats){
      var anchor = remain[0];
      var win = Math.min(remain.length, Math.max(seats, 13));
      var best = null, bestCost = 1e9;
      forEachCombo(remain.slice(1, win), seats - 1, function(combo){
        var g = [anchor].concat(combo);
        var c = pairCost(g, localHist).rep;
        if (c < bestCost){ bestCost = c; best = g; }
      });
      if (!best) best = remain.slice(0, seats);
      best.forEach(function(p){ var i = remain.indexOf(p); if (i >= 0) remain.splice(i, 1); });
      markTable(best);
      out.push(best);
    }
    if (remain.length) out.push(remain);
  }
  return out;
}
/* circle method：固定最后一人，其余轮转；返回 [ [a,b], ... ]，null 表示该位置轮空 */
function circlePairs(list, roundNo){
  var arr = list.slice();
  var n = arr.length;
  if (n < 2) return [];
  var virtual = false;
  if (n % 2 === 1){ arr.push(null); virtual = true; }
  var m = arr.length;
  var r = ((roundNo - 1) % (m - 1) + (m - 1)) % (m - 1);
  var fixed = arr[m - 1];
  var rot = arr.slice(0, m - 1);
  var shifted = rot.slice(r).concat(rot.slice(0, r));
  var pairs = [[fixed, shifted[0]]];
  for (var i = 1; i <= (m - 2) / 2; i++) pairs.push([shifted[i], shifted[m - 1 - i]]);
  return pairs.filter(function(pr){ return pr[0] || pr[1]; });
}

/* 修正桌人数：把多出来的 1~2 人并进已有的 3 人桌，或拆出 3 人桌 */
function balanceTables(tables, seats){
  var out = tables.filter(function(t){ return t.length; });
  if (seats !== 4) return out;
  var i;
  for (i = out.length - 1; i >= 0; i--){
    if (out[i].length > 4){
      var extra = out[i].splice(4);
      for (var k = 0; k < extra.length; k++){
        var target = null;
        for (var j = 0; j < out.length; j++) if (j !== i && out[j].length === 3){ target = out[j]; break; }
        if (target) target.push(extra[k]);
        else out.push([extra[k]]);
      }
    }
  }
  /* 1~2 人桌并入 3 人桌 */
  for (i = out.length - 1; i >= 0; i--){
    if (out[i].length < 3){
      var small = out.splice(i, 1)[0];
      var tgt = null;
      for (var q = 0; q < out.length; q++) if (out[q].length === 3){ tgt = out[q]; break; }
      if (tgt) small.forEach(function(p){ if (tgt.length < 4) tgt.push(p); else out.push([p]); });
      else out.push(small);
    }
  }
  return out.filter(function(t){ return t.length; });
}

/* 根据人数与余数策略，把 pool 分成 [入桌, 轮空] */
function splitBye(pool, seats, remainder){
  var n = pool.length;
  var r = n % seats;
  if (!r) return { pool: pool, byes: [] };
  if (remainder === 'THREE' && seats === 4){
    /* 余 3 人成一张 3 人桌，余 1~2 人并入 */
    return { pool: pool, byes: [] };
  }
  var byeCount = seats - r;      /* 凑不满一桌的人轮空，最多 seats-1 人 */
  if (n - byeCount < seats) byeCount = r;   /* 人太少时反过来 */
  if (remainder === 'GHOST') return { pool: pool, byes: [] };
  return { pool: pool.slice(0, n - byeCount), byes: pool.slice(n - byeCount).map(function(p){ return p.pid; }) };
}
