'use strict';
/* =====================================================================
 * 13-ui-rank.js  排名 / 破同分 / 晋级 / 对阵 / 结果
 * ===================================================================== */

function stageRankView(t, st){
  if (st.format !== 'POINTS') return elimRankView(t, st);
  var rows = stageRanking(t, st);
  var h = '';
  if (!rows.length) return '<div class="card">' + emptyHtml('📊', '还没有成绩', '先在「编排登分」里生成轮次并录入成绩。') + '</div>';
  h += '<div class="card tight"><div class="btnrow">'
     + '<button class="btn primary sm" onclick="showAdvanceRule()">✔ 生成晋级名单</button>'
     + (st.ranking.manual ? '<button class="btn sm ghost" onclick="clearManualRank()">恢复自动排名</button>' : '')
     + '<button class="btn sm ghost" onclick="exportRankDialog()">导出排名</button>'
     + '<button class="btn sm ghost" onclick="exportRankCsv()">导出 CSV</button>'
     + '</div>';
  if (st.ranking.manual) h += '<div class="tiny" style="margin-top:8px">当前为<b>手动排名</b>（用 ↑↓ 调整），生成晋级前会按这个顺序。</div>';
  else h += '<div class="tiny" style="margin-top:8px">破同分顺序：' + st.tiebreak.chain.map(function(k){ return TIEBREAK_LABEL[k] || k; }).join(' › ') + '（可在配置里改）</div>';
  h += '</div>';

  if (st.inherit && st.inherit.mode !== 'RESET'){
    h += '<div class="notice">本阶段继承上一阶段分数：' + (st.inherit.mode === 'FULL' ? '全部继承' : '按 ' + st.inherit.ratio + ' 比例继承')
       + '，已计入总分。</div>';
  }

  var rounds = st.rounds.filter(function(r){ return r.status === 'confirmed'; });
  h += '<div class="tablecard"><div class="scroll"><table class="grid" style="min-width:' + (480 + rounds.length * 54) + 'px">'
     + '<thead><tr><th>#</th><th class="l">选手</th>';
  rounds.forEach(function(r){ h += '<th>R' + r.no + '</th>'; });
  h += '<th>总分</th><th>小分</th><th>修正</th><th>均顺</th><th>1位</th><th>2位</th><th>3位</th><th>4位</th><th>操作</th></tr></thead><tbody>';
  rows.forEach(function(m, i){
    var p = getPlayer(t, m.pid) || { name: '?', withdrawn: false, disqualified: false };
    var cls = p.disqualified ? 'dq' : (p.withdrawn ? 'wd' : '');
    h += '<tr class="' + cls + '">';
    h += '<td class="rk">' + (i + 1) + '</td>';
    h += '<td class="nm">' + esc(p.name)
       + (p.tier ? ' <span class="tag gray">' + esc(p.tier) + '</span>' : '')
       + (p.withdrawn ? ' ' + tagHtml('退赛', 'warn') : '') + (p.disqualified ? ' ' + tagHtml('DQ', 'red') : '') + '</td>';
    rounds.forEach(function(r){ h += '<td class="num">' + fmt(m.rounds[r.no] || 0) + '</td>'; });
    h += '<td class="pts num">' + fmt(m.point) + '</td>';
    h += '<td class="num">' + fmt(m.raw) + '</td>';
    h += '<td><input class="mini" type="number" step="any" value="' + (m.fix ? fmt(m.fix) : '') + '" placeholder="·" onchange="setFix(\'' + m.pid + '\',this.value)"></td>';
    h += '<td class="num">' + fmt(m.avgRank, 2) + '</td>';
    h += '<td class="num">' + m.first + '</td><td class="num">' + m.second + '</td><td class="num">' + m.third + '</td><td class="num">' + m.fourth + '</td>';
    h += '<td><button class="btn xs ghost" onclick="moveRank(\'' + m.pid + '\',-1)">↑</button>'
       + '<button class="btn xs ghost" onclick="moveRank(\'' + m.pid + '\',1)">↓</button></td>';
    h += '</tr>';
  });
  h += '</tbody></table></div></div>';
  h += '<div class="tiny">「修正」是整阶段的手动加减（不影响单轮成绩）。单轮的加减在「编排登分」页各桌里。</div>';
  return h;
}
function elimRankView(t, st){
  var order = elimFinalRanking(t, st);
  if (!order.length){
    return '<div class="card">' + emptyHtml('📊', '还没有对阵成绩', '先在「编排登分」开始第一轮。') + '</div>';
  }
  var perRound = {};
  st.rounds.forEach(function(r){
    if (r.status !== 'confirmed') return;
    calcRound(st, r).forEach(function(tc, ti){
      tc.rows.forEach(function(x){ perRound[x.pid] = (perRound[x.pid] || 0) + x.total; });
    });
  });
  var h = '<div class="card tight"><div class="btnrow">'
     + '<button class="btn sm ghost" onclick="exportRankCsv()">导出 CSV</button>'
     + '<button class="btn sm ghost" onclick="exportBracket()">导出对阵</button></div>'
     + '<div class="tiny" style="margin-top:8px">淘汰赛名次由对阵直接决定，不按累计积分排。</div></div>';
  h += '<div class="tablecard"><div class="scroll"><table class="grid" style="min-width:420px">'
     + '<thead><tr><th>名次</th><th class="l">选手</th><th>累计得分</th><th>状态</th></tr></thead><tbody>';
  order.forEach(function(pid, i){
    var p = getPlayer(t, pid);
    if (!p) return;
    var cls = p.disqualified ? 'dq' : (p.withdrawn ? 'wd' : '');
    h += '<tr class="' + cls + '"><td class="rk">' + (i + 1) + '</td><td class="nm">' + esc(p.name) + '</td>'
       + '<td class="num">' + fmt(perRound[pid] || 0) + '</td>'
       + '<td>' + (p.disqualified ? 'DQ' : (p.withdrawn ? '退赛' : '')) + '</td></tr>';
  });
  h += '</tbody></table></div></div>';
  return h;
}
function setFix(pid, v){  var st = curStage();
  setStageFix(st, pid, v);
  save(); render();
}
function moveRank(pid, d){
  var t = curTournament(), st = curStage();
  var auto = stageRanking(t, st).map(function(r){ return r.pid; });
  var cur = st.ranking.manual && st.ranking.manual.length ? st.ranking.manual.slice() : auto.slice();
  /* 确保包含所有人 */
  auto.forEach(function(p){ if (cur.indexOf(p) < 0) cur.push(p); });
  var i = cur.indexOf(pid);
  var j = i + d;
  if (i < 0 || j < 0 || j >= cur.length) return;
  var tmp = cur[i]; cur[i] = cur[j]; cur[j] = tmp;
  st.ranking.manual = cur;
  save(); render();
}
function clearManualRank(){
  var st = curStage();
  st.ranking.manual = null; save(); render();
}
function showAdvanceRule(){
  var t = curTournament(), st = curStage();
  var rule = st.advance;
  var h = '<div class="modal-title">生成晋级名单</div>'
    + '<div class="field"><label>晋级规则</label>' + segHtml('adv', [['TOP_N', '取前 N 名'], ['MIN_POINT', '分数线'], ['BOTH', '组合']], rule.type, 'advRuleSet') + '</div>'
    + (rule.type !== 'MIN_POINT' ? '<div class="field"><label>取前 N 名</label><input class="input" type="number" value="' + rule.n + '" onchange="stSetAdvNum(\'n\',this.value)"></div>' : '')
    + (rule.type !== 'TOP_N' ? '<div class="field"><label>分数线</label><input class="input" type="number" value="' + rule.min + '" onchange="stSetAdvNum(\'min\',this.value)"></div>' : '')
    + '<div class="dim">点确定后生成晋级名单并写入下一阶段参赛者。</div>'
    + '<div class="modal-actions"><button class="btn ghost" onclick="closeModal()">取消</button>'
    + '<button class="btn primary" onclick="doGenerateAdvancers()">生成</button></div>';
  openModal(h);
}
function advRuleSet(v){ var st = curStage(); st.advance.type = v; save(); closeModal(); showAdvanceRule(); }
function doGenerateAdvancers(){
  var t = curTournament(), st = curStage();
  var list;
  if (st.format === 'POINTS') list = computeAdvancers(t, st, stageRanking(t, st));
  else list = elimFinalRanking(t, st).slice(0, Math.max(0, num(st.advance.n) || 0));
  st.advancers = list;
  st.ranking.finalOrder = stageRanking(t, st).map(function(r){ return r.pid; });
  if (st.format === 'POINTS') st.ranking.finalRanking = st.ranking.finalOrder;
  else st.ranking.finalRanking = elimFinalRanking(t, st);
  /* 同步到下一阶段 */
  var nxt = nextStage(t, st);
  if (nxt){
    nxt.entrants = list.slice();
    nxt.carryIn = {};
  }
  save(); closeModal();
  toast('已生成晋级名单（' + list.length + ' 人）', 'ok');
  render();
}

/* ---------- 晋级 / 结果 ---------- */
function stageAdvanceView(t, st){
  var h = '';
  var adv = st.advancers || [];
  h += '<div class="card"><div class="card-h"><h2>晋级名单</h2>' + tagHtml(adv.length + ' 人', adv.length ? 'brand' : 'gray') + '</div>';
  if (!adv.length){
    var rows = stageRanking(t, st);
    var auto = st.format === 'POINTS'
      ? computeAdvancers(t, st, rows)
      : elimFinalRanking(t, st).slice(0, Math.max(0, num(st.advance.n) || 0));
    h += '<div class="dim" style="margin-bottom:10px">按当前规则可晋级 ' + auto.length + ' 人（前 ' + (st.advance.type === 'TOP_N' ? st.advance.n : '达标') + '）。</div>';
    h += '<button class="btn primary" onclick="showAdvanceRule()">✔ 生成晋级名单</button>';
  } else {
    h += '<div class="list">';
    var rows2 = stageRanking(t, st);
    var rankOf = {};
    rows2.forEach(function(r){ rankOf[r.pid] = r.rank; });
    adv.forEach(function(pid, i){
      h += '<div class="rowline"><span class="label">' + (i + 1) + '. ' + esc(playerName(t, pid)) + '</span>'
         + '<span class="dim">排名 ' + (rankOf[pid] || '—') + '</span></div>';
    });
    h += '</div>';
    h += '<div class="btnrow" style="margin-top:12px">'
       + '<button class="btn ghost sm" onclick="showAdvanceRule()">重新生成</button>'
       + '<button class="btn ghost sm" onclick="exportAdvancers()">导出名单</button>'
       + '</div>';
    var nxt = nextStage(t, st);
    if (nxt){
      h += '<div class="notice" style="margin-top:12px">已同步到下一阶段「' + esc(nxt.name) + '」的参赛者。</div>'
         + '<button class="btn primary" onclick="selectStage(\'' + nxt.id + '\')">去下一阶段 →</button>';
    } else {
      h += '<div class="notice" style="margin-top:12px">这是最后一个阶段。可直接结算赛事结果。</div>'
         + '<button class="btn primary" onclick="addNextStage()">＋ 添加下一阶段</button>';
    }
  }
  h += '</div>';

  /* 结果 */
  var final = st.format === 'POINTS'
    ? (st.ranking.finalRanking || stageRanking(t, st).map(function(r){ return r.pid; }))
    : elimFinalRanking(t, st);
  if (final.length){
    h += '<div class="card"><div class="card-h"><h2>阶段最终名次</h2>'
       + '<button class="btn sm ghost" onclick="applyAsTournamentResult()">设为赛事结果</button></div>';
    h += '<div class="scroll"><table class="grid"><thead><tr><th>名次</th><th class="l">选手</th><th>积分</th></tr></thead><tbody>';
    var rowMap = {};
    stageRanking(t, st).forEach(function(r){ rowMap[r.pid] = r; });
    final.forEach(function(pid, i){
      var p = getPlayer(t, pid);
      if (!p) return;
      h += '<tr><td class="rk">' + (i + 1) + '</td><td class="nm">' + esc(p.name) + '</td>'
         + '<td class="num">' + fmt(rowMap[pid] ? rowMap[pid].point : 0) + '</td></tr>';
    });
    h += '</tbody></table></div></div>';
  }

  /* 本阶段积分 */
  if (st.points && st.points.on){
    var pm = stagePointsMap(t, st);
    var order2 = st.format === 'POINTS' ? stageRanking(t, st).map(function(r){ return r.pid; }) : elimFinalRanking(t, st);
    if (order2.length){
      h += '<div class="card"><div class="card-h"><h3>本阶段积分</h3>'
         + tagHtml(st.points.mode === 'LINEAR' ? '线性公式' : '名次分表', 'gray')
         + tagHtml(st.points.stack ? '计入总分' : '单独计算', st.points.stack ? 'brand' : 'warn') + '</div>';
      h += '<div class="scroll"><table class="grid"><thead><tr><th>名次</th><th class="l">选手</th><th>本阶段积分</th></tr></thead><tbody>';
      order2.forEach(function(pid){
        var p = getPlayer(t, pid);
        if (!p || !pm[pid]) return;
        h += '<tr><td class="rk">' + (pm[pid].rank || '—') + '</td><td class="nm">' + esc(p.name) + '</td>'
           + '<td class="num">' + fmt(pm[pid].points) + '</td></tr>';
      });
      h += '</tbody></table></div></div>';
    }
  }

  /* 赛事结果与积分 */
  var tf = tournamentFinal(t);
  if (tf.length){
    h += '<div class="card"><div class="card-h"><h2>赛事结果</h2>'
       + (t.status !== 'done' ? '<button class="btn sm primary" onclick="finishTournamentNow()">完成赛事</button>' : tagHtml('已结束', 'gray'))
       + '</div>';
    var pts = computeTournamentPoints(t);
    h += '<div class="scroll"><table class="grid"><thead><tr><th>名次</th><th class="l">选手</th><th>赛季积分</th><th>说明</th><th>操作</th></tr></thead><tbody>';
    tf.forEach(function(pid, i){
      var p = getPlayer(t, pid);
      if (!p) return;
      var pt = pts[pid] || { points: 0, note: '' };
      h += '<tr><td class="rk">' + (i + 1) + '</td><td class="nm">' + esc(p.name) + '</td>'
         + '<td class="num">' + fmt(pt.points) + '</td><td class="dim">' + esc(pt.note) + '</td>'
         + '<td><button class="btn xs ghost" onclick="overridePoints(\'' + pid + '\')">改分</button></td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div class="btnrow" style="margin-top:10px">'
       + '<button class="btn sm ghost" onclick="clearPointOverrides()">恢复自动积分</button></div>';
    h += '<div class="tiny" style="margin-top:8px">积分规则来自赛事所属赛季（'
       + esc((getSeason(t.seasonId) || { name: '默认' }).name) + '）。</div>';
  }
  return h;
}
function addNextStage(){
  var t = curTournament(), st = curStage();
  var idx = t.stages.length + 1;
  var nxt = newStage('POINTS', '阶段 ' + idx + ' · 积分赛');
  nxt.entrants = (st.advancers || []).slice();
  t.stages.push(nxt);
  save();
  APP.stageId = nxt.id; APP.tab = 'config';
  render();
}
function applyAsTournamentResult(){
  var t = curTournament(), st = curStage();
  var final = st.format === 'POINTS' ? stageRanking(t, st).map(function(r){ return r.pid; }) : elimFinalRanking(t, st);
  t.result.final = final;
  t.result.manual = null;
  save(); toast('已设为赛事结果', 'ok'); render();
}
function finishTournamentNow(){
  var t = curTournament();
  confirmBox('完成赛事？之后可在赛季榜看到本场积分，赛事仍可重新打开修改。', function(){
    finishTournament(t); save(); closeModal(); render();
  });
}

/* ---------- 对阵图 ---------- */
function stageBracketView(t, st){
  var h = '<div class="bracket-wrap"><div class="bracket">';
  if (!st.rounds.length){
    return '<div class="card">' + emptyHtml('🏁', '还没有对阵', '在「编排登分」开始第一轮。') + '</div>';
  }
  var calcCache = {};
  st.rounds.forEach(function(r){
    var calc = calcRound(st, r);
    h += '<div class="col"><div class="col-title">' + esc(elimRoundLabel(r)) + '</div>';
    r.tables.forEach(function(tb, ti){
      var tc = calc[ti];
      h += '<div class="node"><div class="t">桌 ' + (ti + 1) + (tb.seats.length < st.seats ? ' · ' + tb.seats.length + ' 人' : '') + '</div>';
      tc.rows.slice().sort(function(a, b){ return a.rank - b.rank; }).forEach(function(x){
        var p = getPlayer(t, x.pid);
        var adv = (r.adv || []).indexOf(x.pid) >= 0;
        h += '<div class="pl ' + (adv ? 'adv' : (r.status === 'confirmed' ? 'out' : '')) + '">'
           + '<span>' + esc(p ? p.name : '?') + '</span><b>' + (r.status === 'confirmed' ? fmt(x.total) : '—') + '</b></div>';
      });
      h += '</div>';
    });
    h += '</div>';
  });
  h += '</div></div>';
  h += '<div class="tiny">蓝绿色 = 本轮晋级；灰色 = 已淘汰（未确认的轮次不判断）。</div>';
  h += '<div class="btnrow no-print" style="margin-top:10px"><button class="btn sm ghost" onclick="exportBracket()">导出 / 打印对阵图</button></div>';
  return h;
}
function overridePoints(pid){
  var t = curTournament();
  var p = getPlayer(t, pid);
  var cur = t.result.points && t.result.points[pid];
  promptBox('为「' + (p ? p.name : pid) + '」手动指定本场赛季积分（清空则恢复自动）', cur == null ? '' : cur, function(v){
    t.result = t.result || {};
    t.result.points = t.result.points || {};
    if (String(v).trim() === '') delete t.result.points[pid];
    else t.result.points[pid] = num(v);
    save(); closeModal(); render();
  });
}
function clearPointOverrides(){
  var t = curTournament();
  confirmBox('清除本场全部手动积分覆盖，恢复自动计算？', function(){
    t.result.points = {};
    save(); closeModal(); render();
  });
}
function exportBracket(){
  var t = curTournament(), st = curStage();
  var body = '<h1>' + esc(t.name) + ' · ' + esc(st.name) + ' 对阵</h1><div class="sub">' + fmtDateTime(Date.now()) + '</div>';
  st.rounds.forEach(function(r){
    body += '<h2>' + esc(elimRoundLabel(r)) + '</h2><table><thead><tr><th>桌</th><th class="l">选手</th><th>本轮总分</th><th>名次</th><th>结果</th></tr></thead><tbody>';
    var calc = calcRound(st, r);
    r.tables.forEach(function(tb, ti){
      calc[ti].rows.slice().sort(function(a, b){ return a.rank - b.rank; }).forEach(function(x, xi){
        var p = getPlayer(t, x.pid) || {};
        var adv = (r.adv || []).indexOf(x.pid) >= 0;
        body += '<tr><td>' + (xi === 0 ? '桌 ' + (ti + 1) : '') + '</td><td class="l">' + esc(p.name || '') + '</td>'
          + '<td>' + fmt(x.total) + '</td><td>' + x.rank + '</td>'
          + '<td>' + (r.status === 'confirmed' ? (adv ? '晋级' : '淘汰') : '—') + '</td></tr>';
      });
    });
    body += '</tbody></table>';
  });
  printOrSave(t.name + ' 对阵', body, t.name + '_对阵');
}
