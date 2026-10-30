'use strict';
/* =====================================================================
 * 14-ui-season.js  赛季规则 / 赛季榜
 * ===================================================================== */

function viewSeason(){
  var season = getSeason(APP.seasonId);
  if (!season) return emptyHtml('🏆', '赛季不存在', '', '<button class="btn primary" onclick="go(\'home\')">回首页</button>');
  var board = computeSeasonBoard(season.id);
  var tns = seasonTournaments(season.id).sort(function(a, b){ return b.createdAt - a.createdAt; });
  var h = '';

  h += '<div class="card"><div class="card-h"><h2>' + esc(season.name) + '</h2>'
     + '<button class="btn sm ghost" onclick="renameSeason()">重命名</button>'
     + '<button class="btn sm ghost" onclick="toggleSeasonRules()">积分规则</button></div>';
  h += '<div class="dim">' + tns.length + ' 场比赛 · ' + board.length + ' 位选手'
     + (season.startDate ? ' · ' + esc(season.startDate) + (season.endDate ? ' ~ ' + esc(season.endDate) : '') : '') + '</div>';
  if (APP.seasonRules) h += seasonRulesView(season);
  h += '</div>';

  /* 赛季榜 */
  h += '<div class="card"><div class="card-h"><h2>赛季积分榜</h2>'
     + '<button class="btn sm ghost" onclick="exportSeasonBoard()">导出</button>'
     + '<button class="btn sm ghost" onclick="exportInviteList()">直邀名单</button></div>';
  if (!board.length){
    h += emptyHtml('📈', '还没有积分', '把已完成的赛事归到这个赛季，积分会自动汇总。');
  } else {
    var cols = tns.slice().reverse();
    h += '<div class="tablecard"><div class="scroll"><table class="grid matrix">'
       + '<thead><tr><th>#</th><th class="l">选手</th>' + cols.map(function(tn){ return '<th>' + esc(shortName(tn.name)) + '</th>'; }).join('')
       + '<th>总分</th></tr></thead><tbody>';
    board.forEach(function(row){
      var byTn = {};
      row.items.forEach(function(it){ byTn[it.tid] = (byTn[it.tid] || 0) + it.points; });
      h += '<tr><td class="rk">' + row.rank + '</td>'
         + '<td class="nm">' + esc(row.name) + (row.uid ? ' <span class="dim">#' + esc(row.uid) + '</span>' : '') + '</td>';
      cols.forEach(function(tn){
        var v = byTn[tn.id];
        h += '<td class="num">' + (v == null ? '<span class="dim">—</span>' : fmt(v)) + '</td>';
      });
      h += '<td class="pts num">' + fmt(row.total) + '</td></tr>';
    });
    h += '</tbody></table></div></div>';
  }
  h += '</div>';

  /* 赛季内赛事 */
  h += '<div class="card"><div class="card-h"><h2>赛季内赛事</h2></div>';
  if (!tns.length) h += '<div class="dim">还没有赛事归入本赛季。到赛事菜单里「选择赛季」，或下面把已有赛事加进来。</div>';
  else {
    h += '<div class="list">';
    tns.forEach(function(tn){
      h += '<div class="item" onclick="openTournamentFromSeason(\'' + tn.id + '\')">'
         + '<div class="grow"><div class="name">' + esc(tn.name) + ' ' + (tn.status === 'done' ? tagHtml('已结束') : tagHtml('进行中', 'warn')) + '</div>'
         + '<div class="meta"><span>' + esc(fmtDate(tn.createdAt)) + '</span><span>' + tn.players.length + ' 人</span></div></div>'
         + '<div class="chev">›</div></div>';
    });
    h += '</div>';
  }
  h += '</div>';

  /* 未归入赛季的赛事 */
  var others = DB.tournaments.filter(function(x){ return x.seasonId !== season.id; });
  if (others.length){
    h += '<div class="card"><div class="card-h"><h3>把赛事加入本赛</h3></div><div class="list">';
    others.forEach(function(tn){
      h += '<div class="rowline"><span class="label">' + esc(tn.name) + '</span>'
         + '<button class="btn xs ghost" onclick="addTournamentToSeason(\'' + tn.id + '\')">加入</button></div>';
    });
    h += '</div></div>';
  }
  return h;
}
function shortName(s){ return s.length > 6 ? s.slice(0, 6) + '…' : s; }
function openTournamentFromSeason(id){ openTournament(id); }
function addTournamentToSeason(tid){
  var t = getTournament(tid);
  t.seasonId = APP.seasonId;
  save(); toast('已加入赛季', 'ok'); render();
}
function renameSeason(){
  var s = getSeason(APP.seasonId);
  promptBox('赛季名称', s.name, function(v){ if (!v.trim()) return; s.name = v.trim(); save(); closeModal(); render(); });
}
function toggleSeasonRules(){
  APP.seasonRules = !APP.seasonRules;
  save ? null : null;
  render();
}
function seasonRulesView(season){
  var r = season.rules;
  var h = '<div class="hr"></div>';
  h += '<div class="field"><label>积分方式</label>' + segHtml('mode', [['TABLE', '名次分表'], ['LINEAR', '线性公式']], r.mode, 'seasonSetMode') + '</div>';
  if (r.mode === 'TABLE'){
    h += '<div class="field"><label>名次分表（第 1 名开始，逗号分隔；超出取「其余名次分」）</label>'
       + '<input class="input" value="' + r.rankTable.join(',') + '" onchange="seasonSetRankTable(this.value)"></div>';
    h += '<div class="field"><label>其余名次得分</label><input class="input" type="number" value="' + r.beyond + '" onchange="seasonSetNum(\'beyond\',this.value)"></div>';
  } else {
    h += '<div class="field-row">'
       + '<div class="field"><label>第 1 名得分</label><input class="input" type="number" value="' + r.linear.max + '" onchange="seasonSetLinear(\'max\',this.value)"></div>'
       + '<div class="field"><label>末名得分</label><input class="input" type="number" value="' + r.linear.min + '" onchange="seasonSetLinear(\'min\',this.value)"></div>'
       + '</div><div class="tiny">公式：按名次在最高分与最低分之间线性递减（类似晋级赛积分）。</div>';
  }
  h += '<div class="hr"></div><h3 style="margin-bottom:10px">特殊情况积分</h3>';
  h += '<div class="field-row">'
     + '<div class="field"><label>退赛</label><input class="input" type="number" value="' + r.special.withdrawn + '" onchange="seasonSetSpecial(\'withdrawn\',this.value)"></div>'
     + '<div class="field"><label>取消资格（DQ）</label><input class="input" type="number" value="' + r.special.dq + '" onchange="seasonSetSpecial(\'dq\',this.value)"></div>'
     + '</div>';
  h += '<div class="field-row">'
     + '<div class="field"><label>未出场/未上榜</label><input class="input" type="number" value="' + r.special.unplayed + '" onchange="seasonSetSpecial(\'unplayed\',this.value)"></div>'
     + '<div class="field"><label>缺赛</label><input class="input" type="number" value="' + r.special.absent + '" onchange="seasonSetSpecial(\'absent\',this.value)"></div>'
     + '</div>';
  h += '<div class="hr"></div><h3 style="margin-bottom:10px">统计范围</h3>';
  h += '<div class="field">' + segHtml('cnt', [['all', '赛季内全部'], ['rolling', '最近 N 场']], r.count, 'seasonSetCount') + '</div>';
  if (r.count === 'rolling'){
    h += '<div class="field"><label>N</label><input class="input" type="number" min="1" value="' + r.rollingN + '" onchange="seasonSetNum(\'rollingN\',this.value)"></div>';
  }
  h += '<div class="field-row"><div class="field"><label>开始日期</label><input class="input" type="date" value="' + esc(season.startDate) + '" onchange="seasonSetDate(\'startDate\',this.value)"></div>'
     + '<div class="field"><label>结束日期</label><input class="input" type="date" value="' + esc(season.endDate) + '" onchange="seasonSetDate(\'endDate\',this.value)"></div></div>';
  h += '<div class="tiny">单场赛事的积分可在赛事结果里逐人手动覆盖。</div>';
  return h;
}
function seasonSetMode(v){ var s = getSeason(APP.seasonId); s.rules.mode = v; save(); render(); }
function seasonSetRankTable(v){
  var s = getSeason(APP.seasonId);
  var arr = String(v).split(/[,，\s]+/).map(function(x){ return num(x); });
  s.rules.rankTable = arr.length ? arr : [100]; save(); render();
}
function seasonSetNum(k, v){ var s = getSeason(APP.seasonId); s.rules[k] = Math.max(0, Math.round(num(v))); save(); render(); }
function seasonSetLinear(k, v){ var s = getSeason(APP.seasonId); s.rules.linear[k] = num(v); save(); render(); }
function seasonSetSpecial(k, v){ var s = getSeason(APP.seasonId); s.rules.special[k] = num(v); save(); render(); }
function seasonSetCount(v){ var s = getSeason(APP.seasonId); s.rules.count = v; save(); render(); }
function seasonSetDate(k, v){ var s = getSeason(APP.seasonId); s[k] = v; save(); render(); }
function newSeasonDialog(){
  promptBox('赛季名称', '赛季 ' + (DB.seasons.length + 1), function(v){
    if (!v.trim()) return;
    var s = newSeason(v.trim());
    DB.seasons.push(s);
    DB.activeSeasonId = s.id;
    save(); closeModal();
    go('season', { seasonId: s.id });
  });
}
