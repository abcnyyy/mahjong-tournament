'use strict';
/* =====================================================================
 * 15-io.js  导入导出 / CSV 牌谱 / 打印
 * ===================================================================== */

/* ---------- 全量数据 ---------- */
function exportAllData(){
  saveNow();
  var d = deepClone(DB);
  d.exportedAt = Date.now();
  downloadText('麻将赛事数据_' + stamp() + '.json', JSON.stringify(d, null, 2), 'application/json');
  toast('已导出全部数据', 'ok');
}
function importDataDialog(){
  var h = '<div class="modal-title">导入数据</div>'
    + '<div class="dim" style="margin-bottom:10px">支持本系统导出的 JSON，也支持旧版「好奇杯」数据（会自动转换）。</div>'
    + '<div class="field"><label>导入方式</label>' + segHtml('im', [['merge', '合并（保留现有）'], ['replace', '覆盖全部']], 'merge', 'importModeSet') + '</div>'
    + '<div class="btnrow"><button class="btn primary" onclick="pickJsonFile()">选择 JSON 文件</button></div>'
    + '<div class="modal-actions"><button class="btn primary" onclick="closeModal()">关闭</button></div>';
  openModal(h);
}
var _importMode = 'merge';
function importModeSet(v){ _importMode = v; closeModal(); importDataDialog(); }
function pickJsonFile(){
  pickTextFile('.json,.txt', function(text, name){
    var d;
    try { d = JSON.parse(text); } catch(e){ toast('JSON 解析失败', 'err'); return; }
    var isOld = d && d.tournaments && d.tournaments.some(function(t){ return t.qualifier || t.elimination; }) && !d.seasons;
    if (isOld){
      confirmBox('检测到旧版好奇杯数据（' + d.tournaments.length + ' 场），要转换并导入吗？', function(){
        var conv = migrateOldData(d);
        applyImport(conv);
      });
      return;
    }
    var nd = normalizeDB(d);
    applyImport(nd);
  });
}
function applyImport(nd){
  if (_importMode === 'replace'){
    DB = nd;
    saveNow(); closeAllModals(); toast('已覆盖导入', 'ok'); go('home');
    return;
  }
  /* merge */
  var byId = {};
  DB.tournaments.forEach(function(t){ byId[t.id] = t; });
  var addedT = 0, addedS = 0;
  (nd.tournaments || []).forEach(function(t){
    if (!byId[t.id]){ DB.tournaments.push(t); addedT++; }
  });
  var bySid = {};
  DB.seasons.forEach(function(s){ bySid[s.id] = s; });
  (nd.seasons || []).forEach(function(s){
    if (!bySid[s.id]){ DB.seasons.push(s); addedS++; }
  });
  saveNow(); closeAllModals();
  toast('合并导入：赛事 +' + addedT + '，赛季 +' + addedS, 'ok');
  go('home');
}

/* ---------- 赛期内 / 名单导出 ---------- */
function htmlDoc(title, body){
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + esc(title) + '</title>'
    + '<style>body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;color:#1c2530;margin:24px;font-size:14px}'
    + 'h1{font-size:20px;margin-bottom:4px}h2{font-size:16px;margin:22px 0 8px}'
    + '.sub{color:#8b93a1;font-size:12px;margin-bottom:16px}'
    + 'table{border-collapse:collapse;width:100%;margin:10px 0;font-size:13px}'
    + 'th,td{border:1px solid #dfe3e8;padding:6px 8px;text-align:center}th{background:#f4f6f8}'
    + 'td.l,th.l{text-align:left}.wd{color:#b9bfc9}.dq{color:#c9a5a5;text-decoration:line-through}'
    + '@page{size:A4;margin:12mm}</style></head><body>' + body + '</body></html>';
}
function printOrSave(title, body, filename){
  var doc = htmlDoc(title, body);
  if (window.MTTBridge && window.MTTBridge.printHtml){
    try { window.MTTBridge.printHtml(doc); return; } catch(e){}
  }
  var w = null;
  try { w = window.open('', '_blank'); } catch(e){}
  if (w && w.document){
    w.document.open(); w.document.write(doc); w.document.close();
    setTimeout(function(){ try { w.focus(); w.print(); } catch(e){} }, 350);
  } else {
    downloadText((filename || title) + '.html', doc, 'text/html');
    toast('已导出 HTML（在电脑上打开可另存为 PDF）', 'ok');
  }
}
function exportPlayerList(){
  var t = curTournament();
  var body = '<h1>' + esc(t.name) + ' · 参赛选手名单</h1><div class="sub">共 ' + t.players.length + ' 人 · 导出时间 ' + fmtDateTime(Date.now()) + '</div>';
  var groups = [['直邀', 'invite'], ['预选', 'qualifier'], ['外卡', 'wildcard'], ['手动', 'manual']];
  groups.forEach(function(g){
    var ps = t.players.filter(function(p){ return p.source === g[1] && !p.disqualified; });
    if (!ps.length) return;
    body += '<h2>' + g[0] + '（' + ps.length + '）</h2><table><thead><tr><th>#</th><th class="l">选手</th><th>UID</th><th>状态</th></tr></thead><tbody>';
    ps.forEach(function(p, i){
      body += '<tr><td>' + (i + 1) + '</td><td class="l">' + esc(p.name) + '</td><td>' + esc(p.uid || '—') + '</td>'
            + '<td>' + (p.withdrawn ? '退赛' : '正常') + '</td></tr>';
    });
    body += '</tbody></table>';
  });
  printOrSave(t.name + ' 选手名单', body, t.name + '_选手名单');
}
function exportAdvancers(){
  var t = curTournament(), st = curStage();
  var list = st.advancers || [];
  var body = '<h1>' + esc(t.name) + ' · ' + esc(st.name) + ' 晋级名单</h1>'
    + '<div class="sub">导出时间 ' + fmtDateTime(Date.now()) + '</div><table><thead><tr><th>名次</th><th class="l">选手</th><th>UID</th></tr></thead><tbody>';
  list.forEach(function(pid, i){
    var p = getPlayer(t, pid) || {};
    body += '<tr><td>' + (i + 1) + '</td><td class="l">' + esc(p.name || '') + '</td><td>' + esc(p.uid || '') + '</td></tr>';
  });
  body += '</tbody></table>';
  printOrSave(t.name + ' 晋级名单', body, t.name + '_晋级名单');
}
function exportRankDialog(){
  var t = curTournament(), st = curStage();
  var rows = stageRanking(t, st);
  var body = '<h1>' + esc(t.name) + ' · ' + esc(st.name) + ' 排名</h1>'
    + '<div class="sub">导出时间 ' + fmtDateTime(Date.now()) + ' · 计分：' + (st.scoring.mode === 'RANK_POINT' ? '排名分制' : '纯分数+修正') + '</div>';
  body += '<table><thead><tr><th>名次</th><th class="l">选手</th><th>总分</th><th>原始分</th><th>修正</th><th>均顺位</th><th>1位</th><th>2位</th><th>3位</th><th>4位</th></tr></thead><tbody>';
  rows.forEach(function(r){
    var p = getPlayer(t, r.pid) || {};
    body += '<tr class="' + (p.withdrawn ? 'wd' : '') + '"><td>' + r.rank + '</td><td class="l">' + esc(p.name || '') + '</td>'
      + '<td>' + fmt(r.point) + '</td><td>' + fmt(r.raw) + '</td><td>' + fmt(r.fix) + '</td>'
      + '<td>' + fmt(r.avgRank, 2) + '</td><td>' + r.first + '</td><td>' + r.second + '</td><td>' + r.third + '</td><td>' + r.fourth + '</td></tr>';
  });
  body += '</tbody></table>';
  printOrSave(st.name + ' 排名', body, t.name + '_' + st.name + '_排名');
}
function exportRankCsv(){
  var t = curTournament(), st = curStage();
  var rows = stageRanking(t, st);
  var lines = ['排名,选手,UID,总分,原始分,修正,均顺位,一位,二位,三位,四位,退赛,DQ'];
  rows.forEach(function(r){
    var p = getPlayer(t, r.pid) || {};
    lines.push([r.rank, p.name || '', p.uid || '', fmt(r.point), fmt(r.raw), fmt(r.fix),
      fmt(r.avgRank, 2), r.first, r.second, r.third, r.fourth,
      p.withdrawn ? '退赛' : '', p.disqualified ? 'DQ' : ''].join(','));
  });
  downloadText(t.name + '_' + st.name + '_排名.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast('已导出 CSV（Excel 可直接打开）', 'ok');
}
function exportSeasonBoard(){
  var season = getSeason(APP.seasonId);
  var board = computeSeasonBoard(season.id);
  var tns = seasonTournaments(season.id).filter(tournamentFinished).slice().reverse();
  var body = '<h1>' + esc(season.name) + ' · 积分榜</h1><div class="sub">' + tns.length + ' 场比赛 · ' + fmtDateTime(Date.now()) + '</div>';
  body += '<table><thead><tr><th>#</th><th class="l">选手</th>' + tns.map(function(t){ return '<th>' + esc(t.name) + '</th>'; }).join('') + '<th>总分</th></tr></thead><tbody>';
  board.forEach(function(row){
    var byTn = {};
    row.items.forEach(function(it){ byTn[it.tid] = (byTn[it.tid] || 0) + it.points; });
    body += '<tr><td>' + row.rank + '</td><td class="l">' + esc(row.name) + '</td>'
      + tns.map(function(t){ return '<td>' + (byTn[t.id] == null ? '—' : fmt(byTn[t.id])) + '</td>'; }).join('')
      + '<td>' + fmt(row.total) + '</td></tr>';
  });
  body += '</tbody></table>';
  printOrSave(season.name + ' 积分榜', body, season.name + '_积分榜');
}
function exportInviteList(){
  var season = getSeason(APP.seasonId);
  var list = computeSeasonBoard(season.id);
  var body = '<h1>' + esc(season.name) + ' · 直邀名单</h1><div class="sub">按赛季积分排序 · ' + fmtDateTime(Date.now()) + '</div>'
    + '<table><thead><tr><th>#</th><th class="l">选手</th><th>UID</th><th>积分</th></tr></thead><tbody>';
  list.forEach(function(r){
    body += '<tr><td>' + r.rank + '</td><td class="l">' + esc(r.name) + '</td><td>' + esc(r.uid || '') + '</td><td>' + fmt(r.total) + '</td></tr>';
  });
  body += '</tbody></table>';
  printOrSave(season.name + ' 直邀名单', body, season.name + '_直邀名单');
}
function exportTournamentDialog(){
  var t = curTournament();
  var h = '<div class="modal-title">导出</div><div class="btnrow" style="flex-direction:column;align-items:stretch">'
    + '<button class="btn ghost" onclick="closeModal();exportPlayerList()">选手名单</button>'
    + '<button class="btn ghost" onclick="closeModal();exportAllStages()">全部阶段成绩</button>'
    + '<button class="btn ghost" onclick="closeModal();exportAllData()">全部数据 JSON</button>'
    + '</div><div class="modal-actions"><button class="btn primary" onclick="closeModal()">关闭</button></div>';
  openModal(h);
}
function exportAllStages(){
  var t = curTournament();
  var body = '<h1>' + esc(t.name) + ' · 成绩汇总</h1><div class="sub">' + fmtDateTime(Date.now()) + '</div>';
  t.stages.forEach(function(st){
    body += '<h2>' + esc(st.name) + '（' + FORMAT_LABEL[st.format] + '）</h2>';
    var rows = stageRanking(t, st);
    if (!rows.length) { body += '<p class="sub">暂无成绩</p>'; return; }
    body += '<table><thead><tr><th>名次</th><th class="l">选手</th><th>总分</th><th>均顺位</th><th>1位</th><th>4位</th></tr></thead><tbody>';
    rows.forEach(function(r){
      var p = getPlayer(t, r.pid) || {};
      body += '<tr><td>' + r.rank + '</td><td class="l">' + esc(p.name || '') + '</td><td>' + fmt(r.point) + '</td>'
        + '<td>' + fmt(r.avgRank, 2) + '</td><td>' + r.first + '</td><td>' + r.fourth + '</td></tr>';
    });
    body += '</tbody></table>';
  });
  printOrSave(t.name + ' 成绩汇总', body, t.name + '_成绩汇总');
}

/* ---------- CSV 牌谱导入 ---------- */
function csvParseText(text){
  text = String(text).replace(/^\uFEFF/, '');
  var rows = [], row = [], cell = '', q = false, i = 0;
  while (i < text.length){
    var c = text[i];
    if (q){
      if (c === '"'){
        if (text[i + 1] === '"'){ cell += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      cell += c; i++; continue;
    }
    if (c === '"'){ q = true; i++; continue; }
    if (c === ','){ row.push(cell); cell = ''; i++; continue; }
    if (c === '\r'){ i++; continue; }
    if (c === '\n'){ row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += c; i++;
  }
  if (cell !== '' || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(function(r){ return r.some(function(x){ return String(x).trim() !== ''; }); });
}
var CSV_CPU_RE = /^(电脑|ＣＰＵ|CPU|AI|机器人|小铃)\s*\d*$/i;
function csvParsePlayer(cell){
  var raw = String(cell == null ? '' : cell).trim();
  var m = /^\[[^\]]*\]\[(\d+)\]([\s\S]*)$/.exec(raw);
  if (m) return { uid: m[1], name: m[2].trim(), cpu: m[1] === '0' };
  return { uid: '', name: raw, cpu: CSV_CPU_RE.test(raw) };
}
function csvImportDialog(){
  var t = curTournament(), st = curStage();
  if (!t || !st) return;
  var rounds = st.rounds.filter(function(r){ return r.status !== 'confirmed'; });
  var h = '<div class="modal-title">导入雀魂牌谱 CSV</div>'
    + '<div class="dim" style="margin-bottom:10px">按「1位玩家 / 1位分数 / 1位终局点数」等列解析，自动匹配选手与桌次。请选择要导入的轮次：</div>'
    + '<div class="field"><select class="input" id="csvRound">'
    + (rounds.length ? rounds.map(function(r){ return '<option value="' + r.no + '">第 ' + r.no + ' 轮</option>'; }).join('')
       : '<option value="">（没有未确认的轮次，请先生成一轮）</option>')
    + '</select></div>'
    + '<div class="btnrow"><button class="btn primary" onclick="pickCsvFile()">选择 CSV 文件</button></div>'
    + '<div class="notice" style="margin-top:12px">匹配规则：优先用 UID，其次用昵称；同一桌 4 人必须都能对上。电脑/CPU 会被跳过，对应位置记缺席。</div>'
    + '<div class="modal-actions"><button class="btn primary" onclick="closeModal()">关闭</button></div>';
  openModal(h);
}
function pickCsvFile(){
  var sel = document.getElementById('csvRound');
  var no = sel ? num(sel.value) : 0;
  if (!no){ toast('请先生成一轮', 'err'); return; }
  closeModal();
  pickTextFile('.csv,text/csv', function(text){
    doCsvImport(text, no);
  });
}
function csvPlanImport(t, st, r, text){
  var rows = csvParseText(text);
  if (!rows.length) return { error: 'CSV 为空' };
  var head = rows[0].map(function(x){ return String(x).trim(); });
  function idxOf(name){ for (var i = 0; i < head.length; i++) if (head[i].indexOf(name) >= 0) return i; return -1; }
  var pCols = [], sCols = [];
  for (var n = 1; n <= 4; n++){
    pCols.push(idxOf(n + '位玩家'));
    sCols.push(idxOf(n + '位分数'));
  }
  if (pCols[0] < 0 || sCols[0] < 0){
    return { error: '未识别到雀魂牌谱表头（需要「X位玩家 / X位分数」列）' };
  }
  var byUid = {}, byName = {};
  st.rounds.forEach(function(rr){ rr.tables.forEach(function(tb){ tb.seats.forEach(function(s){
    var p = getPlayer(t, s.pid);
    if (!p) return;
    if (p.uid) byUid[p.uid] = s.pid;
    byName[p.name] = s.pid;
  }); }); });
  var planned = [], skipped = [], unmatch = {};
  for (var i = 1; i < rows.length; i++){
    var row = rows[i];
    var humans = [], cpus = 0, miss = false;
    for (var k = 0; k < 4; k++){
      var pc = pCols[k], sc = sCols[k];
      if (pc < 0 || sc < 0) continue;
      var pl = csvParsePlayer(row[pc]);
      if (!pl.name && !pl.uid) continue;
      if (pl.cpu){ cpus++; continue; }
      var pid = (pl.uid && byUid[pl.uid]) || byName[pl.name] || null;
      if (!pid){ miss = true; unmatch[pl.name || pl.uid] = 1; break; }
      var score = parseFloat(String(row[sc]).replace(/[^\d.\-]/g, ''));
      humans.push({ pid: pid, score: isNaN(score) ? 0 : score, name: pl.name });
    }
    if (miss || humans.length < 2){ skipped.push(i + 1); continue; }
    planned.push({ row: i + 1, humans: humans, cpus: cpus });
  }
  return { planned: planned, skipped: skipped, unmatch: Object.keys(unmatch) };
}
function doCsvImport(text, roundNo){
  var t = curTournament(), st = curStage();
  var r = getRound(st, roundNo);
  if (!r) { toast('轮次不存在', 'err'); return; }
  var plan = csvPlanImport(t, st, r, text);
  if (plan.error){ toast(plan.error, 'err'); return; }
  if (!plan.planned.length){
    toast('没有可导入的对局' + (plan.unmatch && plan.unmatch.length ? '（未匹配：' + plan.unmatch.slice(0, 3).join('、') + '）' : ''), 'err');
    return;
  }
  var h = '<div class="modal-title">确认导入</div>';
  h += '<div class="dim">第 ' + r.no + ' 轮 · 可导入 ' + plan.planned.length + ' 局'
     + (plan.skipped.length ? ' · 跳过 ' + plan.skipped.length + ' 局（第 ' + plan.skipped.slice(0, 8).join(',') + ' 行…）' : '') + '</div>';
  if (plan.unmatch && plan.unmatch.length){
    h += '<div class="notice" style="margin-top:10px">这些名字没匹配到本场选手：' + esc(plan.unmatch.slice(0, 6).join('、')) + '。可在选手池里改昵称或填 UID。</div>';
  }
  h += '<div class="notice" style="margin-top:10px">导入会把每局分数依次填入该桌的空闲局位（最多 ' + st.halvesPerRound + ' 局/轮），电脑位记为缺席。</div>';
  h += '<div class="modal-actions"><button class="btn ghost" onclick="closeModal()">取消</button>'
     + '<button class="btn primary" onclick="applyCsvImport(' + roundNo + ')">写入成绩</button></div>';
  openModal(h);
  _csvPlan = { r: r, planned: plan.planned, st: st };
}
var _csvPlan = null;
function applyCsvImport(roundNo){
  var t = curTournament(), st = curStage();
  var plan = _csvPlan;
  if (!plan) return;
  var r = plan.r;
  var halves = st.halvesPerRound;
  var used = {};
  r.tables.forEach(function(tb, ti){
    tb.seats.forEach(function(s){
      for (var hh = 0; hh < halves; hh++){ if (num(s.scores[hh])) used[tb.id + '|' + hh] = 1; }
    });
  });
  var filled = 0;
  plan.planned.forEach(function(g){
    /* 找包含全部选手的桌 */
    var target = null;
    var pids = g.humans.map(function(x){ return x.pid; });
    r.tables.forEach(function(tb){
      var has = pids.every(function(pid){ return tb.seats.some(function(s){ return s.pid === pid; }); });
      if (has && tb.seats.length >= pids.length){ if (!target) target = tb; }
    });
    if (!target) return;
    var slot = -1;
    for (var hh = 0; hh < halves; hh++){ if (!used[target.id + '|' + hh]){ slot = hh; break; } }
    if (slot < 0) return;
    used[target.id + '|' + slot] = 1;
    var sorted = g.humans.slice().sort(function(a, b){ return b.score - a.score; });
    sorted.forEach(function(x, i){
      target.seats.forEach(function(s){
        if (s.pid === x.pid){ s.scores[slot] = x.score; s.ranks[slot] = i + 1; }
      });
    });
    /* 电脑顶替：未参与且该槽为空的活跃选手记缺席 */
    if (g.cpus > 0){
      var absentIdx = 0;
      target.seats.forEach(function(s){
        var inGame = g.humans.some(function(x){ return x.pid === s.pid; });
        if (!inGame && !num(s.scores[slot])){
          s.scores[slot] = -50;
          s.ranks[slot] = g.humans.length + 1 + absentIdx;
          s.absent = num(s.absent) + 1;
          absentIdx++;
        }
      });
    }
    filled++;
  });
  save(); closeModal();
  toast('已写入 ' + filled + ' 局成绩', 'ok');
  _csvPlan = null;
  render();
}
