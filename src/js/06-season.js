'use strict';
/* =====================================================================
 * 06-season.js  赛季积分
 * ===================================================================== */

function getSeason(id){
  if (!DB) return null;
  for (var i = 0; i < DB.seasons.length; i++) if (DB.seasons[i].id === id) return DB.seasons[i];
  return null;
}
function seasonTournaments(sid){
  return DB.tournaments.filter(function(t){ return t.seasonId === sid; });
}
function tournamentFinished(t){
  return t.status === 'done';
}
/* 赛事最终排名（自动或手动） */
function tournamentFinal(t){
  if (!t.result) t.result = { final: [], manual: null, points: {} };
  if (Array.isArray(t.result.manual) && t.result.manual.length) return t.result.manual;
  if (Array.isArray(t.result.final) && t.result.final.length) return t.result.final;
  var st = t.stages.length ? t.stages[t.stages.length - 1] : null;
  if (!st) return [];
  if (st.format === 'POINTS') return stageRanking(t, st).map(function(r){ return r.pid; });
  return elimFinalRanking(t, st);
}
/* 名次分 */
function pointsByRank(season, rank, total){
  var rules = season.rules;
  if (rules.mode === 'LINEAR'){
    var max = num(rules.linear.max), min = num(rules.linear.min);
    if (total <= 1) return max;
    var p = max - (max - min) * (rank - 1) / (total - 1);
    return Math.round(p * 100) / 100;
  }
  var table = rules.rankTable || [];
  if (rank <= table.length) return num(table[rank - 1]);
  return num(rules.beyond) || 0;
}
/* 单场赛事的积分表：{pid: 分, 说明} */
function computeTournamentPoints(t){
  var season = getSeason(t.seasonId) || defaultPointSeason();
  var final = tournamentFinal(t);
  var out = {};
  final.forEach(function(pid, i){
    var p = getPlayer(t, pid);
    if (!p) return;
    if (p.disqualified){ out[pid] = { points: num(season.rules.special.dq), note: '取消资格' }; return; }
    out[pid] = { points: pointsByRank(season, i + 1, final.length), note: '第 ' + (i + 1) + ' 名' };
  });
  /* 退赛 / 缺赛特例 */
  t.players.forEach(function(p){
    if (out[p.id]) return;
    if (p.disqualified){ out[p.id] = { points: num(season.rules.special.dq), note: '取消资格' }; return; }
    if (p.withdrawn){ out[p.id] = { points: num(season.rules.special.withdrawn), note: '退赛' }; return; }
    out[p.id] = { points: num(season.rules.special.unplayed), note: '未参赛/未上榜' };
  });
  /* 手动覆盖 */
  var ov = t.result.points || {};
  Object.keys(ov).forEach(function(pid){
    if (!out[pid]) out[pid] = { points: 0, note: '手动' };
    out[pid].points = num(ov[pid]);
    out[pid].note = '手动覆盖';
    out[pid].override = true;
  });
  return out;
}
function defaultPointSeason(){
  if (DB.seasons && DB.seasons.length) return DB.seasons[0];
  return newSeason('默认赛季');
}
/* 赛季榜 */
function computeSeasonBoard(sid){
  var season = getSeason(sid);
  if (!season) return [];
  var list = seasonTournaments(sid).filter(tournamentFinished).sort(function(a, b){ return b.createdAt - a.createdAt; });
  if (season.rules.count === 'rolling') list = list.slice(0, season.rules.rollingN);
  list = list.slice().reverse();   /* 旧 → 新 */
  var map = {};
  list.forEach(function(t){
    var pts = computeTournamentPoints(t);
    Object.keys(pts).forEach(function(pid){
      var p = getPlayer(t, pid);
      if (!p) return;
      var key = p.uid ? ('u:' + p.uid) : ('n:' + p.name);
      var row = map[key] || (map[key] = { key: key, name: p.name, uid: p.uid, total: 0, items: [] });
      row.total += num(pts[pid].points);
      row.items.push({ tid: t.id, tname: t.name, points: num(pts[pid].points), note: pts[pid].note, rank: 0 });
    });
  });
  var rows = Object.keys(map).map(function(k){ return map[k]; });
  rows.sort(function(a, b){ return b.total - a.total; });
  rows.forEach(function(r, i){ r.rank = i + 1; });
  return rows;
}
/* 直邀/晋级名单：赛季榜前 N */
function seasonInvites(sid, n){
  return computeSeasonBoard(sid).slice(0, n || 16);
}

/* 赛季内某选手明细 */
function playerSeasonDetail(sid, key){
  var board = computeSeasonBoard(sid);
  for (var i = 0; i < board.length; i++) if (board[i].key === key) return board[i];
  return null;
}

/* 赛事完成：把最终名次写回并归档 */
function finishTournament(t){
  var st = t.stages.length ? t.stages[t.stages.length - 1] : null;
  if (st){
    if (st.format === 'POINTS'){
      t.result.final = stageRanking(t, st).map(function(r){ return r.pid; });
    } else {
      t.result.final = elimFinalRanking(t, st);
    }
  }
  t.status = 'done';
}
