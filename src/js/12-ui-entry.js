'use strict';
/* =====================================================================
 * 12-ui-entry.js  编排与登分
 * ===================================================================== */

/* ---------- 生成第一轮 / 下一轮 ---------- */
function ensureEntrants(t, st){
  if (Array.isArray(st.entrants) && st.entrants.length) return st.entrants;
  var prev = prevStage(t, st);
  var list;
  if (prev){
    if (st.format === 'POINTS'){
      list = prev.advancers && prev.advancers.length ? prev.advancers.slice() : stageRanking(t, prev).map(function(r){ return r.pid; });
    } else {
      list = elimEntrants(t, st);
    }
  } else {
    list = stagePlayers(t, st).map(function(p){ return p.id; });
  }
  st.entrants = list.filter(function(pid){ var p = getPlayer(t, pid); return p && !p.disqualified; });
  return st.entrants;
}
function seedPool(t, st){
  var ids = ensureEntrants(t, st).slice();
  var players = ids.map(function(pid){ return getPlayer(t, pid); }).filter(function(p){ return p && !p.withdrawn && !p.disqualified; });
  var prev = prevStage(t, st);
  var rankMap = {};
  if (prev){
    stageRanking(t, prev).forEach(function(r, i){ rankMap[r.pid] = i + 1; });
  }
  /* 分数：本阶段已打轮次优先，否则用上一阶段名次换算 */
  var cur = computeStage(t, st);
  var pointMap = {};
  cur.rows.forEach(function(r){ pointMap[r.pid] = r.point; });
  var hasRounds = st.rounds.some(function(r){ return r.status === 'confirmed'; });
  var pool = players.map(function(p, idx){
    var points = hasRounds ? (pointMap[p.id] || 0) : 0;
    var seedRank = rankMap[p.id] || (num(p.seed) || idx + 1);
    return { pid: p.id, points: points, tier: p.tier || '', seed: seedRank, name: p.name };
  });
  if (!hasRounds){
    if (st.pairing.seed === 'RANDOM') pool = shuffle(pool, hashStr(st.id) + st.rounds.length);
    else if (st.pairing.seed === 'PREV') pool.sort(function(a, b){ return a.seed - b.seed; });
    else pool.sort(function(a, b){ return (getPlayer(t, a.pid).seed || 0) - (getPlayer(t, b.pid).seed || 0); });
  } else {
    pool.sort(function(a, b){ return b.points - a.points; });
  }
  return pool;
}
function modeForRound(st, roundNo){
  var ov = st.pairing.roundOverride || {};
  return ov[String(roundNo)] || st.pairing.mode;
}
function countRepeats(tables, hist){
  var rep = 0;
  tables.forEach(function(g){
    for (var i = 0; i < g.length; i++)
      for (var j = i + 1; j < g.length; j++)
        if (hist[pairKey(g[i].pid, g[j].pid)]) rep++;
  });
  return rep;
}
function buildRoundTables(t, st, roundNo){
  var pool = seedPool(t, st);
  var primary = modeForRound(st, roundNo);
  var cfg = deepClone(st.pairing);
  cfg._seed = hashStr(st.id + '_' + roundNo);
  cfg._roundNo = roundNo;
  var hist = pairHistory(st, roundNo);
  /* 主编排 + 并存回退链：选重复同桌最少的一种 */
  var modes = [primary];
  (st.pairing.chain || []).forEach(function(m){ if (modes.indexOf(m) < 0) modes.push(m); });
  var best = null, bestRep = Infinity, bestMode = primary;
  modes.forEach(function(m){
    var c = deepClone(cfg);
    c.mode = m;
    var tables = cleanTables(makeTables(pool, st.seats, c, hist), st.seats);
    if (!tables.length) return;
    var rep = countRepeats(tables, hist);
    if (rep < bestRep){ bestRep = rep; best = tables; bestMode = m; }
  });
  if (!best) best = cleanTables(makeTables(pool, st.seats, cfg, hist), st.seats);
  APP.lastPairMode = bestMode;
  return { tables: best, mode: bestMode, repeats: bestRep };
}
function cleanTables(tables, seats){
  return tables.map(function(g){
    return g.filter(function(x){ return x && x.pid; });
  }).filter(function(g){ return g.length >= 2; });
}
function startPointsRound(t, st){
  if (!st.rounds.length) startStage(t, st);
  var roundNo = st.rounds.length + 1;
  var built = buildRoundTables(t, st, roundNo);
  var groups = built.tables || [];
  var r = defaultRound(roundNo);
  r.mode = built.mode;
  r.repeats = built.repeats;
  /* 余数处理 */
  if (groups.length && groups[groups.length - 1].length < st.seats){
    var tail = groups[groups.length - 1];
    if (st.pairing.remainder === 'BYE' || tail.length < 2){
      groups.pop();
      r.byes = tail.map(function(x){ return x.pid; });
    }
  }
  groups.forEach(function(g){
    var tb = newTable([]);
    g.forEach(function(x){ tb.seats.push(defaultSeat(x.pid)); });
    if (tb.seats.length >= 2) r.tables.push(tb);
  });
  if (!r.tables.length) { toast('人数不足，无法分桌', 'err'); return null; }
  st.rounds.push(r);
  if (!st.entrants) ensureEntrants(t, st);
  save();
  return r;
}
function startElimRound(t, st){
  if (!st.rounds.length) startStage(t, st);
  ensureEntrants(t, st);
  if (!st.elimState){
    st.elimState = {
      kind: st.format, winners: [], losers: [],
      initialLosers: Math.max(0, Math.min(num(st.elim.initialLosers) || 0, Math.max(0, st.entrants.length - st.seats))),
      wFinals: false, lFinals: false, gf: false, gfDone: false, done: false, finalRanking: null
    };
    var ents = st.entrants.slice();
    st.elimState.winners = ents.slice(0, ents.length - st.elimState.initialLosers);
    st.elimState.losers = ents.slice(ents.length - st.elimState.initialLosers);
  }
  var r = createElimRound(t, st);
  if (!r){
    toast('没有可生成的轮次（赛程已结束）');
    return null;
  }
  /* 淘汰赛轮间继承分数 */
  if (st.elim.carry && st.rounds.length){
    var cum = {};
    st.rounds.forEach(function(rr){
      rr.tables.forEach(function(tb){
        tb.seats.forEach(function(s){
          cum[s.pid] = (cum[s.pid] || 0) + seatTotals(s, st.halvesPerRound).base - num(s.carry);
        });
      });
    });
    r.tables.forEach(function(tb){
      tb.seats.forEach(function(s){ s.carry = cum[s.pid] || 0; });
    });
  }
  st.rounds.push(r);
  save();
  return r;
}

/* ---------- 阶段启动（传承分） ---------- */
function startStage(t, st){
  ensureEntrants(t, st);
  var prev = prevStage(t, st);
  if (prev && st.inherit.mode !== 'RESET'){
    var rows = stageRanking(t, prev);
    var ratio = st.inherit.mode === 'FULL' ? 1 : num(st.inherit.ratio);
    st.carryIn = {};
    rows.forEach(function(r){ st.carryIn[r.pid] = round2(r.point * ratio); });
  }
  st.status = 'active';
  save();
}

/* ---------- 登分页 ---------- */
function stageEntryView(t, st){
  var h = '';
  if (!ensureEntrants(t, st).length){
    return '<div class="card">' + noticeHtml('本阶段还没有参赛选手。请先在「选手池」导入，或先完成上一阶段并生成晋级名单。') + '</div>';
  }
  var last = lastRound(st);
  var open = openRound(st);
  var confirmedAll = !open && st.rounds.length > 0;

  h += '<div class="card tight"><div class="btnrow">';
  if (!st.rounds.length){
    h += '<button class="btn primary" onclick="doStartRound()">' + (st.format === 'POINTS' ? '🎲 开始第 1 轮（自动分桌）' : '🏁 开始第 1 轮') + '</button>';
  } else if (open){
    h += '<button class="btn primary" onclick="doConfirmRound()">✔ 确认第 ' + open.no + ' 轮</button>';
    h += '<button class="btn ghost" onclick="doRegenerateRound()">🎲 重新分桌</button>';
    h += '<button class="btn ghost" onclick="openSeatEditor()">⇄ 手动换座</button>';
    if (st.rounds.length > 1 || open.no > 1) h += '<button class="btn ghost" onclick="doRollbackRound()">↩ 回退</button>';
  } else {
    h += '<button class="btn primary" onclick="doStartRound()">＋ 开始第 ' + (st.rounds.length + 1) + ' 轮</button>';
    h += '<button class="btn ghost" onclick="doRollbackRound()">↩ 回退上一轮</button>';
    if (st.format !== 'POINTS' && !st.elimState.done) { /* 继续 */ }
  }
  if (st.rounds.length > 1) h += '<button class="btn ghost" onclick="openRoundPicker()">查看轮次</button>';
  h += '</div>';

  if (st.rounds.length){
    var view = APP.roundNo || last.no;
    var r = getRound(st, view) || last;
    h += '<div class="dim" style="margin-top:8px">第 ' + r.no + ' / ' + st.roundCount + ' 轮 · ' + r.tables.length + ' 桌 · 每桌 ' + st.halvesPerRound + ' 局'
       + (r.status === 'confirmed' ? ' · 已确认' : ' · 录入中')
       + (r.mode && st.format === 'POINTS' ? ' · 编排：' + (PAIR_MODES[r.mode] || r.mode) : '')
       + (r.repeats ? ' · 重复同桌 ' + r.repeats + ' 对' : '') + '</div>';
  }
  h += '</div>';

  if (st.format === 'POINTS' && st.rounds.length >= st.roundCount && confirmedAll){
    h += noticeHtml('已达到设定轮数。可去「排名」页查看结果并生成晋级名单，或在配置里增加轮数。', 'ok');
  }
  if (!st.rounds.length){
    h += '<div class="card">' + emptyHtml('🎲', '还没有轮次', '点上面的按钮自动分桌。分桌方式在「配置」里设置。') + '</div>';
    return h;
  }
  var r2 = getRound(st, APP.roundNo || last.no) || last;
  h += roundEntryHtml(t, st, r2);
  return h;
}
function openRoundPicker(){
  var st = curStage();
  var h = '<div class="modal-title">查看轮次</div><div class="list">';
  st.rounds.forEach(function(r){
    h += '<button class="btn ghost" style="justify-content:space-between" onclick="closeModal();APP.roundNo=' + r.no + ';render()">'
       + '第 ' + r.no + ' 轮 <span class="dim">' + r.tables.length + ' 桌 · ' + (r.status === 'confirmed' ? '已确认' : '录入中') + '</span></button>';
  });
  h += '</div><div class="modal-actions"><button class="btn primary" onclick="closeModal()">关闭</button></div>';
  openModal(h);
}

function roundEntryHtml(t, st, r){
  var h = '';
  var halves = st.halvesPerRound;
  if (r.status === 'confirmed'){
    h += noticeHtml('本轮已确认，数据只读。要修改请先「回退」。', '');
  }
  if (r.type) h += '<div class="chiprow" style="margin-bottom:8px">' + tagHtml(elimRoundLabel(r), 'brand') + tagHtml('每桌晋 ' + st.elim.perTable + ' 人', 'gray') + '</div>';
  var calc = calcRound(st, r);
  var ptLabel = (st.scoring.mode === 'PURE' && st.scoring.entryMode === 'ADJUSTED') ? '点数(含修正)' : '点数';
  r.tables.forEach(function(tb, ti){
    var tc = calc[ti];
    h += '<div class="tablecard"><div class="head">'
       + '<span class="no" style="background:var(--brand-soft);color:var(--brand-2);border-radius:8px;padding:2px 9px;font-size:12.5px;font-weight:700">桌 ' + (ti + 1) + '</span>'
       + '<span class="dim">' + tb.seats.length + ' 人</span><span class="grow"></span>';
    if (r.status !== 'confirmed'){
      h += '<button class="btn xs ghost" onclick="openTableSwap(' + ti + ')">换人</button>';
    }
    h += '</div>';
    h += '<div class="scroll"><table class="grid"><thead><tr><th class="l" style="min-width:110px">选手</th>';
    for (var i = 0; i < halves; i++){
      h += '<th>第' + (i + 1) + '局<br>顺位</th><th>第' + (i + 1) + '局<br>' + ptLabel + '</th>';
    }
    if (st.scoring.manual) h += '<th>加分</th><th>扣分</th><th>迟到</th><th>缺席</th>';
    h += '<th>小分</th><th>轮修正</th><th>本轮总分</th><th>顺位</th></tr></thead><tbody>';
    tb.seats.forEach(function(s){
      var row = tc.rows.filter(function(x){ return x.pid === s.pid; })[0] || { total: 0, rank: 0, point: 0 };
      var p = getPlayer(t, s.pid);
      var cls = p && p.disqualified ? 'dq' : (p && p.withdrawn ? 'wd' : '');
      h += '<tr class="' + cls + '"><td class="nm">' + (p ? esc(p.name) : '（已删除）') + '</td>';
      for (var j = 0; j < halves; j++){
        h += '<td>' + cellInput(r, tb, s, 'rank', j, s.ranks[j], r.status) + '</td>';
        h += '<td>' + cellInput(r, tb, s, 'score', j, s.scores[j], r.status) + '</td>';
      }
      if (st.scoring.manual){
        h += '<td>' + cellInput(r, tb, s, 'bonus', -1, s.bonus, r.status) + '</td>';
        h += '<td>' + cellInput(r, tb, s, 'penalty', -1, s.penalty, r.status) + '</td>';
        h += '<td>' + cellInput(r, tb, s, 'late', -1, s.late, r.status) + '</td>';
        h += '<td>' + cellInput(r, tb, s, 'absent', -1, s.absent, r.status) + '</td>';
      }
      h += '<td class="num dim">' + fmt(row.raw) + '</td>'
         + '<td class="num dim">' + fmt(row.point - row.raw) + '</td>'
         + '<td class="pts num">' + fmt(row.point) + '</td><td><b>' + row.rank + '</b></td></tr>';
    });
    h += '</tbody></table></div></div>';
  });
  if (r.byes && r.byes.length){
    h += '<div class="card tight"><div class="dim">轮空：' + r.byes.map(function(pid){ return esc(playerName(t, pid)); }).join('、') + '</div></div>';
  }
  return h;
}
function cellInput(r, tb, s, field, half, val, status){
  var locked = (status === 'confirmed' || status === true);
  var attr = 'data-field="' + field + '" data-r="' + r.no + '" data-t="' + tb.id + '" data-p="' + s.pid + '" data-h="' + half + '"';
  if (locked) return '<span class="num">' + fmt(val) + '</span>';
  var v = (val === 0 || val == null) ? '' : val;
  return '<input class="mini" type="number" step="any" inputmode="decimal" value="' + (v === '' ? '' : fmt(val)) + '" placeholder="·" ' + attr + '>';
}

/* ---------- 输入事件（委托） ---------- */
function onEntryInput(e, silent){
  var el = e.target;
  if (!el || !el.getAttribute) return;
  var field = el.getAttribute('data-field');
  if (!field) return;
  var st = curStage(), t = curTournament();
  if (!st || !t) return;
  var r = getRound(st, num(el.getAttribute('data-r')));
  if (!r || r.status === 'confirmed') return;
  var tb = null;
  r.tables.forEach(function(x){ if (x.id === el.getAttribute('data-t')) tb = x; });
  if (!tb) return;
  var pid = el.getAttribute('data-p'), h = num(el.getAttribute('data-h'));
  var seat = null;
  tb.seats.forEach(function(s){ if (s.pid === pid) seat = s; });
  if (!seat) return;
  var v = el.value === '' ? 0 : num(el.value);
  if (field === 'score') seat.scores[h] = v;
  else if (field === 'rank') seat.ranks[h] = v;
  else seat[field] = Math.max(0, v);
  save();
  if (!silent) scheduleEntryRefresh();
}
var _entryTimer = null;
function scheduleEntryRefresh(){
  clearTimeout(_entryTimer);
  _entryTimer = setTimeout(function(){
    var ae = document.activeElement;
    var sel = null, sig = null;
    try {
      if (ae && ae.getAttribute){
        sig = [ae.getAttribute('data-field'), ae.getAttribute('data-r'), ae.getAttribute('data-t'), ae.getAttribute('data-p'), ae.getAttribute('data-h')].join('|');
        sel = ae.selectionStart;
      }
    } catch(e){}
    render();
    if (sig){
      var el2 = document.querySelector('[data-field="' + sig.split('|')[0] + '"][data-r="' + sig.split('|')[1] + '"][data-t="' + sig.split('|')[2] + '"][data-p="' + sig.split('|')[3] + '"][data-h="' + sig.split('|')[4] + '"]');
      if (el2){ try { el2.focus(); el2.setSelectionRange(sel, sel); } catch(e){} }
    }
  }, 260);
}

/* ---------- 轮次操作 ---------- */
function doStartRound(){
  var t = curTournament(), st = curStage();
  if (st.format === 'POINTS'){
    if (st.rounds.length >= st.roundCount && st.rounds.every(function(r){ return r.status === 'confirmed'; })){
      confirmBox('已到设定轮数（' + st.roundCount + ' 轮），仍要继续加一轮吗？', function(){
        closeModal(); startPointsRound(t, st); APP.roundNo = st.rounds[st.rounds.length - 1].no; render();
      });
      return;
    }
    if (!ensureEntrants(t, st).length){ toast('没有参赛选手', 'err'); return; }
    var r = startPointsRound(t, st);
    APP.roundNo = r.no;
    render();
  } else {
    var r2 = startElimRound(t, st);
    if (!r2) return;
    APP.roundNo = r2.no;
    render();
  }
}
function doRegenerateRound(){
  var t = curTournament(), st = curStage();
  var r = openRound(st);
  if (!r) return;
  confirmBox('重新分桌会清空本轮已录入的成绩。继续？', function(){
    st.rounds = st.rounds.filter(function(x){ return x !== r; });
    if (st.format === 'POINTS'){
      var nr = startPointsRound(t, st);
      APP.roundNo = nr.no;
    } else {
      st.elimState = null;
      var nr2 = startElimRound(t, st);
      if (nr2) APP.roundNo = nr2.no;
    }
    save(); closeModal(); render();
  }, { danger: true, yesText: '重新分' });
}
function doConfirmRound(){
  var t = curTournament(), st = curStage();
  var r = openRound(st);
  if (!r) return;
  if (st.format === 'POINTS'){
    r.status = 'confirmed';
    if (st.rounds.length >= st.roundCount) toast('本轮已确认，已完成全部轮次', 'ok');
    else toast('第 ' + r.no + ' 轮已确认', 'ok');
  } else {
    confirmElimRound(t, st, r);
    toast('第 ' + r.no + ' 轮已确认', 'ok');
  }
  save(); render();
}
function doRollbackRound(){
  var t = curTournament(), st = curStage();
  var done = st.rounds.filter(function(r){ return r.status === 'confirmed'; });
  if (!done.length){ toast('没有可回退的轮次'); return; }
  var r = done[done.length - 1];
  confirmBox('回退第 ' + r.no + ' 轮？该轮将变为录入中，之后的内容会被清除。', function(){
    var idx = st.rounds.indexOf(r);
    st.rounds = st.rounds.slice(0, idx + 1);
    r.status = 'open';
    if (st.format !== 'POINTS'){
      /* 重建淘汰赛状态：从已确认轮重放 */
      rebuildElimState(t, st);
    }
    if (st.advancers){ delete st.advancers; }
    save(); closeModal(); render();
  });
}
function rebuildElimState(t, st){
  var initial = st.elimState ? st.elimState.initialLosers : (num(st.elim.initialLosers) || 0);
  st.elimState = {
    kind: st.format, winners: [], losers: [], initialLosers: initial,
    wFinals: false, lFinals: false, gf: false, gfDone: false, done: false, finalRanking: null
  };
  var ents = ensureEntrants(t, st).slice();
  st.elimState.winners = ents.slice(0, ents.length - initial);
  st.elimState.losers = ents.slice(ents.length - initial);
  st.rounds.forEach(function(r){
    if (r.status !== 'confirmed') return;
    confirmElimRound(t, st, r);
  });
}

/* ---------- 换座 ---------- */
function openSeatEditor(){
  var t = curTournament(), st = curStage();
  var r = openRound(st);
  if (!r){ toast('没有进行中的轮次'); return; }
  var h = '<div class="modal-title">手动换座 · 第 ' + r.no + ' 轮</div><div class="dim" style="margin-bottom:8px">把选手挪到别的桌，成绩跟着人走。留空表示轮空。</div>';
  h += '<div class="scroll" style="max-height:52vh"><table class="grid"><thead><tr><th class="l">选手</th><th>当前桌</th><th>改到</th></tr></thead><tbody>';
  r.tables.forEach(function(tb, ti){
    tb.seats.forEach(function(s){
      var opts = '<option value="">轮空</option>';
      for (var i = 0; i < r.tables.length; i++) opts += '<option value="' + i + '"' + (i === ti ? ' selected' : '') + '>桌 ' + (i + 1) + '</option>';
      h += '<tr><td class="nm">' + esc(playerName(t, s.pid)) + '</td><td>' + (ti + 1) + '</td>'
         + '<td><select class="input" style="padding:4px" data-move-pid="' + s.pid + '" data-move-idx="' + ti + '">' + opts + '</select></td></tr>';
    });
  });
  h += '</tbody></table></div><div class="modal-actions">'
     + '<button class="btn ghost" onclick="closeModal()">取消</button>'
     + '<button class="btn primary" onclick="saveSeatEditor()">保存</button></div>';
  openModal(h);
}
function saveSeatEditor(){
  var t = curTournament(), st = curStage();
  var r = openRound(st);
  var selects = document.querySelectorAll('[data-move-pid]');
  var moves = [];
  for (var i = 0; i < selects.length; i++){
    moves.push({ pid: selects[i].getAttribute('data-move-pid'), to: selects[i].value });
  }
  var seatData = {};
  r.tables.forEach(function(tb){ tb.seats.forEach(function(s){ seatData[s.pid] = s; }); });
  var newTables = r.tables.map(function(){ return { id: uid('tb'), seats: [] }; });
  var byes = [];
  moves.forEach(function(m){
    if (m.to === ''){ byes.push(m.pid); return; }
    var ti = num(m.to);
    if (!newTables[ti]) return;
    newTables[ti].seats.push(seatData[m.pid]);
  });
  r.tables = newTables.filter(function(tb){ return tb.seats.length >= 2; });
  /* 落单的选手转为轮空，避免丢人 */
  newTables.forEach(function(tb){
    if (tb.seats.length === 1 && byes.indexOf(tb.seats[0].pid) < 0) byes.push(tb.seats[0].pid);
  });
  r.byes = byes;
  save(); closeModal(); render();
}
function openTableSwap(ti){
  var t = curTournament(), st = curStage();
  var r = openRound(st);
  if (!r) return;
  var tb = r.tables[ti];
  var h = '<div class="modal-title">桌 ' + (ti + 1) + ' 换人</div><div class="dim" style="margin-bottom:8px">选择要换出的选手，再选一个空闲活跃选手换入。</div>';
  tb.seats.forEach(function(s){
    h += '<button class="btn ghost" style="display:block;width:100%;text-align:left;margin-bottom:6px" onclick="swapSeatPick(\'' + s.pid + '\')">' + esc(playerName(t, s.pid)) + '</button>';
  });
  h += '<div class="modal-actions"><button class="btn primary" onclick="closeModal()">关闭</button></div>';
  openModal(h);
}
function swapSeatPick(pid){
  var t = curTournament(), st = curStage();
  var r = openRound(st);
  var seated = {};
  r.tables.forEach(function(tb){ tb.seats.forEach(function(s){ seated[s.pid] = 1; }); });
  var free = activePlayers(t).filter(function(p){ return !seated[p.id]; });
  if (!free.length){ toast('没有空闲选手可换'); return; }
  var h = '<div class="modal-title">换下 ' + esc(playerName(t, pid)) + '</div><div class="list">';
  free.forEach(function(p){
    h += '<button class="btn ghost" style="justify-content:flex-start" onclick="doSwapSeat(\'' + pid + '\',\'' + p.id + '\')">' + esc(p.name) + '</button>';
  });
  h += '</div><div class="modal-actions"><button class="btn primary" onclick="closeModal()">取消</button></div>';
  openModal(h);
}
function doSwapSeat(oldPid, newPid){
  var t = curTournament(), st = curStage();
  var r = openRound(st);
  r.tables.forEach(function(tb){
    tb.seats.forEach(function(s, i){
      if (s.pid === oldPid){ tb.seats[i] = defaultSeat(newPid); }
    });
  });
  save(); closeModal(); render();
}

function elimRoundLabel(r){
  var map = { W: '胜者组', L: '败者组', WF: '胜者组决赛', LF: '败者组决赛', GF: '总决赛', K: '淘汰轮' };
  return '第 ' + r.no + ' 轮 · ' + (map[r.type] || '淘汰');
}
