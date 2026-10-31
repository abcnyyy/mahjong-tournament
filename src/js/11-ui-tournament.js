'use strict';
/* =====================================================================
 * 11-ui-tournament.js  赛事外壳 / 选手池 / 阶段配置
 * ===================================================================== */

var SOURCE_LABEL = { manual: '手动', invite: '直邀', qualifier: '预选', wildcard: '外卡' };
var FORMAT_LABEL = { POINTS: '积分赛', SINGLE: '单败淘汰', DOUBLE: '双败淘汰' };

function viewTournament(){
  var t = curTournament();
  if (!t) return emptyHtml('🀄', '赛事不存在', '可能已被删除', '<button class="btn primary" onclick="go(\'home\')">回首页</button>');
  var h = '<div class="steps">';
  h += '<div class="step ' + (!APP.stageId ? 'on' : '') + '" onclick="selectPlayersView()"><span class="n">' + t.players.length + '</span>选手池</div>';
  t.stages.forEach(function(st, i){
    var badge = st.format === 'POINTS' ? '积分' : (st.format === 'SINGLE' ? '单败' : '双败');
    h += '<div class="step ' + (APP.stageId === st.id ? 'on' : '') + '" onclick="selectStage(\'' + st.id + '\')">'
      + '<span class="n">' + (i + 1) + '</span>' + esc(st.name) + ' · ' + badge + '</div>';
  });
  h += '<div class="step" onclick="addStageDialog()"><span class="n">＋</span>添加阶段</div>';
  h += '</div>';

  if (!APP.stageId) h += playersView(t);
  else {
    var st = getStage(t, APP.stageId);
    if (!st) h += playersView(t);
    else h += stageView(t, st);
  }
  return h;
}
function selectPlayersView(){ APP.stageId = null; APP.tab = 'players'; render(); }
function selectStage(sid){
  APP.stageId = sid;
  APP.tab = 'entry';
  var st = curStage();
  if (st && st.rounds.length) APP.roundNo = st.rounds[st.rounds.length - 1].no;
  render();
}

/* ==================== 选手池 ==================== */
function playersView(t){
  var active = activePlayers(t).length;
  var wd = t.players.filter(function(p){ return p.withdrawn; }).length;
  var dq = t.players.filter(function(p){ return p.disqualified; }).length;
  var h = '<div class="card">';
  h += '<div class="card-h"><h2>选手池</h2>' + tagHtml(active + ' 人', 'brand')
     + (wd ? tagHtml('退赛 ' + wd, 'warn') : '') + (dq ? tagHtml('DQ ' + dq, 'red') : '') + '</div>';
  h += '<div class="btnrow" style="margin-bottom:12px">'
     + '<button class="btn primary sm" onclick="addPlayersDialog()">＋ 批量导入选手</button>'
     + '<button class="btn sm ghost" onclick="importPlayersFromTournament()">从其他赛事导入</button>'
     + '<button class="btn sm ghost" onclick="importFromSeasonInvites()">从赛季直邀导入</button>'
     + '<button class="btn sm ghost" onclick="exportPlayerList()">导出名单</button>'
     + '</div>';
  if (!t.players.length){
    h += emptyHtml('👥', '还没有选手', '点「批量导入选手」，一行一个名字，或「UID 名字」的格式。');
  } else {
    h += '<div class="scroll"><table class="grid"><thead><tr><th>#</th><th class="l">选手</th><th>UID</th><th>来源</th><th>状态</th><th>操作</th></tr></thead><tbody>';
    t.players.forEach(function(p, i){
      var cls = p.disqualified ? 'dq' : (p.withdrawn ? 'wd' : '');
      h += '<tr class="' + cls + '"><td class="rk">' + (i + 1) + '</td>'
         + '<td class="nm">' + esc(p.name) + '</td>'
         + '<td>' + esc(p.uid || '—') + '</td>'
         + '<td>' + tagHtml(SOURCE_LABEL[p.source] || p.source, p.source === 'invite' ? 'gold' : '') + '</td>'
         + '<td>' + (p.disqualified ? tagHtml('DQ', 'red') : (p.withdrawn ? tagHtml('退赛', 'warn') : tagHtml('正常', 'ok'))) + '</td>'
         + '<td><button class="btn xs ghost" onclick="playerMenu(\'' + p.id + '\')">管理</button></td></tr>';
    });
    h += '</tbody></table></div>';
  }
  h += '</div>';
  return h;
}
function addPlayersDialog(){
  var t = curTournament();
  var h = '<div class="modal-title">批量导入选手</div>'
    + '<div class="dim" style="margin-bottom:8px">一行一个。格式：<b>名字</b> 或 <b>UID 名字</b>。重复名字会自动跳过。</div>'
    + '<div class="field"><textarea class="input" id="bulkPlayers" data-autofocus style="min-height:180px" placeholder="qrk415&#10;62182794 福路美穗子&#10;赤木俊"></textarea></div>'
    + '<div class="field"><label>来源标记</label><select class="input" id="bulkSource">'
    + '<option value="manual">手动录入</option><option value="invite">直邀</option>'
    + '<option value="qualifier">预选</option><option value="wildcard">外卡</option></select></div>'
    + '<div class="modal-actions"><button class="btn ghost" onclick="closeModal()">取消</button>'
    + '<button class="btn primary" onclick="doAddPlayers()">导入</button></div>';
  openModal(h);
}
function doAddPlayers(){
  var t = curTournament();
  var raw = document.getElementById('bulkPlayers').value || '';
  var source = document.getElementById('bulkSource').value;
  var lines = raw.split(/\r?\n/).map(function(s){ return s.trim(); }).filter(Boolean);
  var exist = {};
  t.players.forEach(function(p){ exist[p.name] = 1; });
  var added = 0, dup = 0, bad = 0;
  lines.forEach(function(line){
    var parts = line.split(/\s+/);
    var uid = '', name = line;
    if (parts.length > 1 && /^\d{3,}$/.test(parts[0])){ uid = parts[0]; name = parts.slice(1).join(' '); }
    name = name.trim();
    if (!name){ bad++; return; }
    if (exist[name]){ dup++; return; }
    exist[name] = 1;
    t.players.push(newPlayer(name, { uid: uid, source: source }));
    added++;
  });
  save();
  closeModal();
  toast('导入 ' + added + ' 人' + (dup ? '，重复跳过 ' + dup : '') + (bad ? '，无效 ' + bad : ''), 'ok');
  render();
}
function importPlayersFromTournament(){
  var t = curTournament();
  var others = DB.tournaments.filter(function(x){ return x.id !== t.id && x.players.length; });
  if (!others.length){ toast('没有其他赛事可导入'); return; }
  var h = '<div class="modal-title">从其他赛事导入选手</div><div class="list">';
  others.forEach(function(o){
    h += '<button class="btn ghost" style="justify-content:space-between" onclick="doImportPlayersFrom(\'' + o.id + '\')">'
       + esc(o.name) + ' <span class="dim">' + o.players.length + ' 人</span></button>';
  });
  h += '</div><div class="modal-actions"><button class="btn primary" onclick="closeModal()">取消</button></div>';
  openModal(h);
}
function doImportPlayersFrom(id){
  var src = getTournament(id), t = curTournament();
  var exist = {};
  t.players.forEach(function(p){ exist[p.name] = 1; });
  var n = 0;
  src.players.forEach(function(p){
    if (exist[p.name]) return;
    exist[p.name] = 1;
    t.players.push(newPlayer(p.name, { uid: p.uid, source: p.source }));
    n++;
  });
  save(); closeModal(); toast('导入 ' + n + ' 人', 'ok'); render();
}
function playerMenu(pid){
  var t = curTournament(), p = getPlayer(t, pid);
  if (!p) return;
  var h = '<div class="modal-title">' + esc(p.name) + '</div>'
    + '<div class="dim" style="margin-bottom:10px">UID：' + esc(p.uid || '无') + ' · 来源：' + esc(SOURCE_LABEL[p.source] || p.source) + '</div>'
    + '<div class="btnrow" style="flex-direction:column;align-items:stretch">'
    + '<button class="btn ghost" onclick="renamePlayer(\'' + pid + '\')">重命名</button>'
    + '<button class="btn ghost" onclick="editPlayerUid(\'' + pid + '\')">修改 UID</button>'
    + '<button class="btn ghost" onclick="editPlayerTier(\'' + pid + '\')">设置分档（' + esc(p.tier || '未分档') + '）</button>'
    + '<button class="btn ghost" onclick="togglePlayerWithdraw(\'' + pid + '\')">' + (p.withdrawn ? '取消退赛' : '标记退赛') + '</button>'
    + '<button class="btn ghost" onclick="togglePlayerDQ(\'' + pid + '\')">' + (p.disqualified ? '取消 DQ' : '取消资格（DQ）') + '</button>'
    + '<button class="btn danger" onclick="removePlayerFromTournament(\'' + pid + '\')">删除选手</button>'
    + '</div><div class="modal-actions"><button class="btn primary" onclick="closeModal()">关闭</button></div>';
  openModal(h);
}
function renamePlayer(pid){
  var t = curTournament(), p = getPlayer(t, pid);
  promptBox('选手名字', p.name, function(v){
    if (!v.trim()) return;
    p.name = v.trim(); save(); closeModal(); render();
  });
}
function editPlayerUid(pid){
  var t = curTournament(), p = getPlayer(t, pid);
  promptBox('玩家 UID（用于牌谱 CSV 匹配，可空）', p.uid, function(v){ p.uid = v.trim(); save(); closeModal(); render(); });
}
function editPlayerTier(pid){
  var t = curTournament(), p = getPlayer(t, pid);
  promptBox('分档（用于「分档抽签」，如 S/A/B/C 或 1/2/3）', p.tier, function(v){ p.tier = v.trim(); save(); closeModal(); render(); });
}
function togglePlayerWithdraw(pid){
  var t = curTournament(), p = getPlayer(t, pid);
  if (!p.withdrawn){
    confirmBox('标记「' + p.name + '」退赛？成绩会保留，排名沉底且不占晋级名额。', function(){
      p.withdrawn = true; save(); closeModal(); render();
    }, { yesText: '确定退赛' });
  } else { p.withdrawn = false; save(); closeModal(); render(); }
}
function togglePlayerDQ(pid){
  var t = curTournament(), p = getPlayer(t, pid);
  if (!p.disqualified){
    confirmBox('取消「' + p.name + '」资格？成绩与积分清零，不参与排名。', function(){
      p.disqualified = true; save(); closeModal(); render();
    }, { danger: true, yesText: '取消资格' });
  } else { p.disqualified = false; save(); closeModal(); render(); }
}
function removePlayerFromTournament(pid){
  var t = curTournament(), p = getPlayer(t, pid);
  confirmBox('从赛事中删除「' + p.name + '」？已录入的成绩会一并删除。', function(){
    t.players = t.players.filter(function(x){ return x.id !== pid; });
    t.stages.forEach(function(st){
      st.rounds.forEach(function(r){
        r.tables.forEach(function(tb){ tb.seats = tb.seats.filter(function(s){ return s.pid !== pid; }); });
        r.byes = r.byes.filter(function(x){ return x !== pid; });
        r.adv = (r.adv || []).filter(function(x){ return x !== pid; });
      });
      if (st.ranking && Array.isArray(st.ranking.manual)) st.ranking.manual = st.ranking.manual.filter(function(x){ return x !== pid; });
    });
    save(); closeModal(); render();
  }, { danger: true, yesText: '删除' });
}

function importFromSeasonInvites(){
  var t = curTournament();
  if (!DB.seasons.length){ toast('还没有赛季'); return; }
  var h = '<div class="modal-title">从赛季直邀名单导入</div><div class="dim" style="margin-bottom:10px">按赛季积分榜顺序导入，可指定导入人数。</div>';
  h += '<div class="field"><label>赛季</label><select class="input" id="invSeason">'
     + DB.seasons.map(function(s){ return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('')
     + '</select></div>';
  h += '<div class="field"><label>导入前 N 名</label><input class="input" type="number" id="invN" value="16" min="1"></div>';
  h += '<div class="modal-actions"><button class="btn ghost" onclick="closeModal()">取消</button>'
     + '<button class="btn primary" onclick="doImportInvites()">导入</button></div>';
  openModal(h);
}
function doImportInvites(){
  var t = curTournament();
  var sid = document.getElementById('invSeason').value;
  var n = Math.max(1, Math.round(num(document.getElementById('invN').value) || 16));
  var board = computeSeasonBoard(sid).slice(0, n);
  var exist = {};
  t.players.forEach(function(p){ exist[p.name] = 1; });
  var added = 0;
  board.forEach(function(r){
    if (exist[r.name]) return;
    exist[r.name] = 1;
    t.players.push(newPlayer(r.name, { uid: r.uid, source: 'invite' }));
    added++;
  });
  save(); closeModal();
  toast(added ? ('导入 ' + added + ' 位直邀选手') : '没有可导入的选手（可能都已在名单里）', added ? 'ok' : '');
  render();
}

/* ==================== 添加 / 删除阶段 ==================== */
function addStageDialog(){
  var t = curTournament();
  var h = '<div class="modal-title">添加阶段</div>'
    + '<div class="dim" style="margin-bottom:10px">每个阶段独立设置赛制、桌人数、轮数、每轮局数、计分与晋级规则。</div>';
  [['POINTS', '积分赛', '循环 / 高高碰 / 分层 / 分档编排，按积分排名晋级'],
   ['SINGLE', '单败淘汰', '每桌晋级 1~2 人，输一次即淘汰'],
   ['DOUBLE', '双败淘汰', '胜者组 / 败者组，输两次淘汰']].forEach(function(o){
    h += '<button class="btn ghost" style="display:block;width:100%;text-align:left;padding:14px;margin-bottom:8px" onclick="doAddStage(\'' + o[0] + '\')">'
      + '<b>' + o[1] + '</b><div class="dim" style="margin-top:2px">' + o[2] + '</div></button>';
  });
  h += '<div class="modal-actions"><button class="btn primary" onclick="closeModal()">取消</button></div>';
  openModal(h);
}
function doAddStage(format){
  var t = curTournament();
  var idx = t.stages.length + 1;
  var st = newStage(format, '阶段 ' + idx + (format === 'POINTS' ? ' · 积分赛' : (format === 'SINGLE' ? ' · 单败' : ' · 双败')));
  if (format !== 'POINTS'){
    st.seats = 4;
    st.halvesPerRound = 3;
    st.elim.perTable = 2;
    st.roundCount = 4;
  }
  /* 继承上一阶段的分数（默认清零） */
  if (t.stages.length){
    st.inherit.mode = 'RESET';
  }
  t.stages.push(st);
  save(); closeModal();
  APP.stageId = st.id; APP.tab = 'config';
  render();
}
function deleteStage(){
  var t = curTournament(), st = curStage();
  confirmBox('删除阶段「' + st.name + '」及其实成绩？', function(){
    t.stages = t.stages.filter(function(x){ return x.id !== st.id; });
    save(); closeModal();
    APP.stageId = t.stages.length ? t.stages[0].id : null;
    render();
  }, { danger: true, yesText: '删除' });
}

/* ==================== 阶段页面 ==================== */
function stageView(t, st){
  var h = '';
  var status = st.rounds.length ? (st.rounds[st.rounds.length - 1].status === 'confirmed' ? tagHtml('本轮已确认', 'ok') : tagHtml('录入中', 'warn')) : tagHtml('未开始', 'gray');
  h += '<div class="card tight"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
     + '<h2 style="flex:1">' + esc(st.name) + '</h2>' + status
     + '<span class="tag gray">' + FORMAT_LABEL[st.format] + '</span>'
     + '<span class="tag gray">' + st.seats + ' 人桌</span>'
     + '<span class="tag gray">' + st.roundCount + ' 轮 × ' + st.halvesPerRound + ' 局</span>'
     + '</div>';
  var tabs = [['entry', '编排登分'], ['rank', '排名'], ['config', '配置']];
  if (st.format !== 'POINTS') tabs.push(['bracket', '对阵']);
  tabs.push(['advance', '晋级/结果']);
  h += '<div class="tabs" style="margin-top:10px;margin-bottom:0">';
  tabs.forEach(function(tb){
    h += '<button class="' + (APP.tab === tb[0] ? 'on' : '') + '" onclick="setStageTab(\'' + tb[0] + '\')">' + tb[1] + '</button>';
  });
  h += '</div></div>';
  if (APP.tab === 'config') h += stageConfigView(t, st);
  else if (APP.tab === 'rank') h += stageRankView(t, st);
  else if (APP.tab === 'bracket') h += stageBracketView(t, st);
  else if (APP.tab === 'advance') h += stageAdvanceView(t, st);
  else h += stageEntryView(t, st);
  return h;
}
function setStageTab(tab){ APP.tab = tab; render(); }

/* ==================== 阶段配置 ==================== */
var TIEBREAK_KEYS = ['RAW', 'SUM_RANK', 'AVG_RANK', 'AVG_ROUND_RANK', 'FIRST', 'SECOND', 'THIRD', 'LAST', 'FIRST_RATE', 'LAST_RATE', 'H2H', 'BYE', 'SEED', 'RANDOM'];
function stageConfigView(t, st){
  var h = '';
  h += '<div class="card"><div class="card-h"><h3>基础</h3>'
     + '<button class="btn xs danger" onclick="deleteStage()">删除阶段</button></div>';
  h += '<div class="field"><label>阶段名称</label><input class="input" value="' + esc(st.name) + '" onchange="stSet(\'name\',this.value)"></div>';
  h += '<div class="field"><label>赛制</label>' + segHtml('format', [['POINTS', '积分赛'], ['SINGLE', '单败淘汰'], ['DOUBLE', '双败淘汰']], st.format, 'stSetFormat') + '</div>';
  h += '<div class="field-row">'
     + '<div class="field"><label>每桌人数</label>' + segHtml('seats', [[4, '4 人'], [3, '3 人']], st.seats, 'stSetSeats') + '</div>'
     + '<div class="field"><label>轮数</label><input class="input" type="number" min="1" value="' + st.roundCount + '" onchange="stSetNum(\'roundCount\',this.value)"></div>'
     + '</div>';
  h += '<div class="field"><label>每轮局数（半庄数）</label><input class="input" type="number" min="1" max="12" value="' + st.halvesPerRound + '" onchange="stSetHalves(this.value)"></div>';

  if (st.format === 'POINTS'){
    h += '<div class="hr"></div><h3 style="margin-bottom:10px">编排</h3>';
    h += '<div class="field"><label>默认编排方式</label>'
       + '<select class="input" onchange="stSetPair(\'mode\',this.value)">'
       + Object.keys(PAIR_MODES).map(function(k){ return '<option value="' + k + '"' + (st.pairing.mode === k ? ' selected' : '') + '>' + PAIR_MODES[k] + '</option>'; }).join('')
       + '</select></div>';
    h += '<div class="field"><label>并存回退链（主编排找不到合适桌时依次尝试）</label><div class="chiprow">';
    ['SWISS', 'LAYER', 'TIER', 'RR'].forEach(function(k){
      var on = st.pairing.chain.indexOf(k) >= 0;
      h += '<button class="btn xs ' + (on ? 'primary' : 'ghost') + '" onclick="stToggleChain(\'' + k + '\')">' + PAIR_MODES[k] + '</button>';
    });
    h += '</div><div class="tiny" style="margin-top:6px">示例：高高碰 + 分层抽签 —— 先按积分找同桌，仍重复时改分层抽签。</div></div>';
    h += '<div class="field-row">'
       + '<div class="field"><label>首轮种子来源</label>' + segHtml('seed', [['RANDOM', '随机'], ['PREV', '上阶段名次'], ['MANUAL', '按选手顺序']], st.pairing.seed, 'stSetPairSeed') + '</div>'
       + '<div class="field"><label>避免重复同桌</label>' + segHtml('avoid', [['soft', '尽量'], ['strict', '严格'], ['off', '不避免']], st.pairing.avoidRepeat, 'stSetAvoid') + '</div>'
       + '</div>';
    h += '<div class="field-row">'
       + '<div class="field"><label>分层人数</label><input class="input" type="number" min="2" value="' + st.pairing.layerSize + '" onchange="stSetPairNum(\'layerSize\',this.value)"></div>'
       + '<div class="field"><label>人数不整除时</label>' + segHtml('rem', [['BYE', '轮空'], ['THREE', '3 人桌'], ['GHOST', '补幽灵位']], st.pairing.remainder, 'stSetRemainder') + '</div>'
       + '</div>';
    h += '<div class="field"><label>循环赛：分成几个小组</label><input class="input" type="number" min="1" value="' + st.pairing.rrGroups + '" onchange="stSetPairNum(\'rrGroups\',this.value)"></div>';

    h += '<div class="hr"></div><h3 style="margin-bottom:10px">计分</h3>';
    h += '<div class="field"><label>计分方式</label>' + segHtml('mode', [['RANK_POINT', '排名分制'], ['PURE', '纯分数 + 修正']], st.scoring.mode, 'stSetScoringMode') + '</div>';
    h += '<div class="field"><label>排名口径</label>' + segHtml('src', [['TABLE', '桌内排名'], ['GLOBAL', '全场排名']], st.scoring.rankSource, 'stSetRankSource') + '</div>';
    h += '<div class="field"><label>名次分表 · 4 人桌（1 位 → 4 位，逗号分隔）</label>'
       + '<input class="input" value="' + st.scoring.rankTable['4'].join(',') + '" onchange="stSetRankTable(4,this.value)"></div>';
    h += '<div class="field"><label>名次分表 · 3 人桌</label>'
       + '<input class="input" value="' + st.scoring.rankTable['3'].join(',') + '" onchange="stSetRankTable(3,this.value)"></div>';
    h += '<div class="field"><label>名次分来源（可同时启用）</label>'
       + '<label class="check"><input type="checkbox" ' + (st.scoring.rankBasisRound ? 'checked' : '') + ' onchange="stSetRankBasisRound(this.checked)">每轮：按本轮总分排名给一次</label>'
       + '<label class="check"><input type="checkbox" ' + (st.scoring.rankBasisHand ? 'checked' : '') + ' onchange="stSetRankBasisHand(this.checked)">每局：每个半庄分别排名各给一次</label>'
       + '</div><div class="tiny" style="margin:-6px 0 8px">两个都勾 = 两笔名次分相加。排名分制与纯分数+修正都按这个规则。</div>';
    h += '<label class="check"><input type="checkbox" ' + (st.scoring.tieSplit ? 'checked' : '') + ' onchange="stSetScoring(\'tieSplit\',this.checked)">并列平分名次分</label>';
    if (st.scoring.mode === 'PURE'){
      if ((st.scoring.entryMode || 'RAW') === 'RAW'){
        h += '<label class="check"><input type="checkbox" ' + (st.scoring.useRankTable !== false ? 'checked' : '') + ' onchange="stSetScoring(\'useRankTable\',this.checked)">把名次分作为修正计入</label>';
      }
      h += '<div class="field"><label>录入口径</label>'
         + segHtml('em', [['RAW', '原始点数'], ['ADJUSTED', '含名次修正的点数']], st.scoring.entryMode || 'RAW', 'stSetEntryMode')
         + '</div><div class="tiny" style="margin:-6px 0 8px">选「含名次修正」时：录入框里填已经加过名次修正的点数，系统用「录入值 − 名次修正」反推出原始点数，作为破同分的小分。</div>';
    }
    h += '<label class="check"><input type="checkbox" ' + (st.scoring.topBonus.on ? 'checked' : '') + ' onchange="stSetTopBonus(this.checked)">每轮 TOP 加分</label>';
    if (st.scoring.topBonus.on){
      h += '<div class="field"><label>TOP 加分（按同桌并列第一名人数，逗号分隔：1人/2人/3人/4人）</label>'
         + '<input class="input" value="' + st.scoring.topBonus.values.join(',') + '" onchange="stSetTopBonusValues(this.value)"></div>';
    }
    h += '<label class="check"><input type="checkbox" ' + (st.scoring.water.on ? 'checked' : '') + ' onchange="stSetWaterOn(this.checked)">水上 / 水下修正</label>';
    if (st.scoring.water.on){
      h += '<div class="field-row">'
         + '<div class="field"><label>水上线（≥ 加分）</label><input class="input" type="number" value="' + st.scoring.water.high + '" onchange="stSetWater(\'high\',this.value)"></div>'
         + '<div class="field"><label>加多少</label><input class="input" type="number" value="' + st.scoring.water.highAdd + '" onchange="stSetWater(\'highAdd\',this.value)"></div>'
         + '</div><div class="field-row">'
         + '<div class="field"><label>水下线（≤ 减分）</label><input class="input" type="number" value="' + st.scoring.water.low + '" onchange="stSetWater(\'low\',this.value)"></div>'
         + '<div class="field"><label>减多少</label><input class="input" type="number" value="' + st.scoring.water.lowAdd + '" onchange="stSetWater(\'lowAdd\',this.value)"></div>'
         + '</div>';
    }
    h += '<div class="field"><label>轮空得分</label><input class="input" type="number" step="any" value="' + st.scoring.byePoint + '" onchange="stSetScoringNum(\'byePoint\',this.value)"></div>';
    h += '<label class="check"><input type="checkbox" ' + (st.scoring.manual ? 'checked' : '') + ' onchange="stSetScoring(\'manual\',this.checked)">显示手动加减修正栏</label>';
  } else {
    h += '<div class="hr"></div><h3 style="margin-bottom:10px">淘汰赛</h3>';
    h += '<div class="field"><label>每桌晋级人数</label>' + segHtml('k', [[1, '1 人'], [2, '2 人']], st.elim.perTable, 'stSetPerTable') + '</div>';
    h += '<div class="field"><label>每局计分（同积分赛）</label><div class="dim">按本轮总分排名结算晋级；另可开分数继承 ↓</div></div>';
    h += '<div class="field"><label>名次分表 · 4 人桌</label><input class="input" value="' + st.scoring.rankTable['4'].join(',') + '" onchange="stSetRankTable(4,this.value)"></div>';
    h += '<div class="field"><label>名次分表 · 3 人桌</label><input class="input" value="' + st.scoring.rankTable['3'].join(',') + '" onchange="stSetRankTable(3,this.value)"></div>';
    h += '<label class="check"><input type="checkbox" ' + (st.scoring.tieSplit ? 'checked' : '') + ' onchange="stSetScoring(\'tieSplit\',this.checked)">并列平分名次分</label>';
    h += '<label class="check"><input type="checkbox" ' + (st.scoring.topBonus.on ? 'checked' : '') + ' onchange="stSetTopBonus(this.checked)">每轮 TOP 加分</label>';
    if (st.scoring.topBonus.on){
      h += '<div class="field"><label>TOP 加分（1人/2人/3人/4人并列）</label>'
         + '<input class="input" value="' + st.scoring.topBonus.values.join(',') + '" onchange="stSetTopBonusValues(this.value)"></div>';
    }
    h += '<label class="check"><input type="checkbox" ' + (st.elim.carry ? 'checked' : '') + ' onchange="stSetElimCarry(this.checked)">轮与轮之间继承分数（不清零）</label>';
    if (st.format === 'DOUBLE'){
      h += '<div class="field"><label>初始直接进败者组的人数（按上阶段名次从末位取）</label><input class="input" type="number" min="0" value="' + (num(st.elim.initialLosers) || 0) + '" onchange="stSetElimInitLosers(this.value)"></div>';
      h += '<div class="field"><label>总决赛组桌</label>' + segHtml('gf', [['TOPK', '两组决赛桌前 2'], ['CHAMPIONS', '两组冠军同桌']], st.elim.grandFinal, 'stSetGrandFinal') + '</div>';
    }
    h += '<div class="field"><label>人数不足时的补足</label><label class="check"><input type="checkbox" ' + (st.elim.fillUp !== false ? 'checked' : '') + ' onchange="stSetElimFill(this.checked)">从本赛事其他活跃选手补足（否则按实际人数缩桌）</label></div>';
  }

  h += '<div class="hr"></div><h3 style="margin-bottom:10px">破同分规则（自上而下依次比较）</h3>';
  h += '<div class="chiprow">';
  st.tiebreak.chain.forEach(function(k, i){
    h += '<span class="tag brand" style="padding:5px 8px">' + (i + 1) + '. ' + esc(TIEBREAK_LABEL[k] || k)
       + ' <button class="btn xs ghost" style="padding:0 4px" onclick="stMoveTie(' + i + ',-1)">↑</button>'
       + ' <button class="btn xs ghost" style="padding:0 4px" onclick="stMoveTie(' + i + ',1)">↓</button>'
       + ' <button class="btn xs ghost" style="padding:0 4px" onclick="stRemoveTie(' + i + ')">×</button></span>';
  });
  h += '</div>';
  h += '<div class="field" style="margin-top:10px"><select class="input" onchange="stAddTie(this.value);this.value=\'\'">'
     + '<option value="">＋ 添加规则…</option>'
     + TIEBREAK_KEYS.filter(function(k){ return st.tiebreak.chain.indexOf(k) < 0; })
         .map(function(k){ return '<option value="' + k + '">' + TIEBREAK_LABEL[k] + '</option>'; }).join('')
     + '</select></div>';

  h += '<div class="hr"></div><h3 style="margin-bottom:10px">分数继承</h3>';
  h += '<div class="field"><label>从上一阶段带来的分数</label>'
     + segHtml('inh', [['RESET', '清零'], ['FULL', '全部继承'], ['RATIO', '按比例']], st.inherit.mode, 'stSetInherit') + '</div>';
  if (st.inherit.mode === 'RATIO'){
    h += '<div class="field"><label>比例（如 0.5）</label><input class="input" type="number" step="0.05" value="' + st.inherit.ratio + '" onchange="stSetInheritRatio(this.value)"></div>';
  }
  if (st.format !== 'POINTS'){
    h += '<div class="tiny">淘汰赛轮间继承请在「淘汰赛」区块单独设置。</div>';
  }

  h += '<div class="hr"></div><h3 style="margin-bottom:10px">阶段积分（赛季积分用）</h3>';
  h += '<label class="check"><input type="checkbox" ' + (st.points.on ? 'checked' : '') + ' onchange="stSetPointsOn(this.checked)">本阶段计入赛季积分</label>';
  if (st.points.on){
    h += '<div class="field"><label>积分方式</label>' + segHtml('pm', [['TABLE', '名次分表'], ['LINEAR', '线性公式']], st.points.mode, 'stSetPointsMode') + '</div>';
    if (st.points.mode === 'TABLE'){
      h += '<div class="field"><label>名次分表（第 1 名开始，逗号分隔；超出取「其余名次得分」）</label>'
         + '<input class="input" value="' + st.points.rankTable.join(',') + '" onchange="stSetPointsRankTable(this.value)"></div>';
      h += '<div class="field"><label>其余名次得分</label><input class="input" type="number" value="' + st.points.beyond + '" onchange="stSetPointsNum(\'beyond\',this.value)"></div>';
    } else {
      h += '<div class="field-row">'
         + '<div class="field"><label>第 1 名得分</label><input class="input" type="number" value="' + st.points.linear.max + '" onchange="stSetPointsLinear(\'max\',this.value)"></div>'
         + '<div class="field"><label>末名得分</label><input class="input" type="number" value="' + st.points.linear.min + '" onchange="stSetPointsLinear(\'min\',this.value)"></div>'
         + '</div>';
    }
    h += '<label class="check"><input type="checkbox" ' + (st.points.stack ? 'checked' : '') + ' onchange="stSetPointsStack(this.checked)">与之前阶段叠加为总积分</label>';
    h += '<div class="tiny" style="margin:-4px 0 8px">关闭时：本阶段积分单独计算，不计入赛事总积分（只用于本阶段排名/晋级）。</div>';
    h += '<div class="field-row">'
       + '<div class="field"><label>退赛得分</label><input class="input" type="number" value="' + st.points.special.withdrawn + '" onchange="stSetPointsSpecial(\'withdrawn\',this.value)"></div>'
       + '<div class="field"><label>DQ 得分</label><input class="input" type="number" value="' + st.points.special.dq + '" onchange="stSetPointsSpecial(\'dq\',this.value)"></div>'
       + '</div>';
    h += '<div class="field"><label>未出场得分</label><input class="input" type="number" value="' + st.points.special.unplayed + '" onchange="stSetPointsSpecial(\'unplayed\',this.value)"></div>';
    h += '<div class="btnrow"><button class="btn sm ghost" onclick="savePointsTemplate()">保存为模板</button>'
       + '<button class="btn sm ghost" onclick="loadPointsTemplate()">从模板载入</button></div>';
  }
  h += '<div class="tiny" style="margin-top:8px">赛季积分 = 本赛事各阶段积分之和（只算勾了「叠加」的阶段）；赛事结果页可逐人手动覆盖。</div>';

  h += '<div class="hr"></div><h3 style="margin-bottom:10px">晋级下一阶段</h3>';
  h += '<div class="field"><label>晋级规则</label>'
     + segHtml('adv', [['TOP_N', '取前 N 名'], ['MIN_POINT', '达到分数线'], ['BOTH', '两者组合']], st.advance.type, 'stSetAdvType') + '</div>';
  if (st.advance.type !== 'MIN_POINT'){
    h += '<div class="field"><label>取前 N 名</label><input class="input" type="number" min="1" value="' + st.advance.n + '" onchange="stSetAdvNum(\'n\',this.value)"></div>';
  }
  if (st.advance.type !== 'TOP_N'){
    h += '<div class="field"><label>分数线</label><input class="input" type="number" value="' + st.advance.min + '" onchange="stSetAdvNum(\'min\',this.value)"></div>';
  }
  h += '<div class="tiny">阶段结束后，在「晋级/结果」页点「生成晋级名单」。</div>';
  h += '</div>';
  return h;
}

/* 配置 setter */
function stSet(key, v){
  var st = curStage(); if (!st) return;
  st[key] = v;
  save(); render();
}
function stSetFormat(v){
  var st = curStage(); if (!st) return;
  function apply(){
    st.format = v;
    if (v !== 'POINTS' && st.halvesPerRound === 2) st.halvesPerRound = 3;
    if (st.rounds.length){ st.rounds = []; st.elimState = null; st.entrants = null; }
    save(); render();
  }
  if (st.rounds.length) confirmBox('切换赛制会清空本阶段已生成的轮次与成绩。继续？', function(){ closeModal(); apply(); }, { danger: true, yesText: '清空并切换' });
  else apply();
}
function stSetSeats(v){
  var st = curStage();
  var seats = num(v) === 3 ? 3 : 4;
  function apply(){ st.seats = seats; st.rounds = []; st.elimState = null; save(); render(); }
  if (st.rounds.length) confirmBox('改桌人数会清空本阶段轮次与成绩。继续？', function(){ closeModal(); apply(); }, { danger: true, yesText: '清空并修改' });
  else apply();
}
function stSetNum(key, v){ var st = curStage(); st[key] = Math.max(1, Math.round(num(v) || 1)); save(); render(); }
function stSetHalves(v){
  var st = curStage(); var n = Math.max(1, Math.min(12, Math.round(num(v) || 1)));
  function apply(){
    st.halvesPerRound = n;
    st.rounds.forEach(function(r){
      r.tables.forEach(function(tb){ tb.seats.forEach(function(s){
        while (s.scores.length < n) s.scores.push(0);
        while (s.ranks.length < n) s.ranks.push(0);
        s.scores.length = n; s.ranks.length = n;
      }); });
    });
    save(); render();
  }
  if (st.rounds.length) confirmBox('改每轮局数会清空本阶段轮次与成绩。继续？', function(){ closeModal(); apply(); }, { danger: true, yesText: '清空并修改' });
  else apply();
}
function stSetPair(key, v){ var st = curStage(); st.pairing[key] = v; save(); render(); }
function stSetPairSeed(v){ stSetPair('seed', v); }
function stSetAvoid(v){ stSetPair('avoidRepeat', v); }
function stSetRemainder(v){ stSetPair('remainder', v); }
function stSetPairNum(key, v){ var st = curStage(); st.pairing[key] = Math.max(1, Math.round(num(v) || 1)); save(); render(); }
function stToggleChain(k){
  var st = curStage(), i = st.pairing.chain.indexOf(k);
  if (i >= 0) st.pairing.chain.splice(i, 1); else st.pairing.chain.push(k);
  save(); render();
}
function stSetScoring(key, v){ var st = curStage(); st.scoring[key] = v; save(); render(); }
function stSetEntryMode(v){ var st = curStage(); st.scoring.entryMode = v; save(); render(); }
function stSetScoringNum(key, v){ var st = curStage(); st.scoring[key] = num(v); save(); render(); }
function stSetRankBasisRound(on){ var st = curStage(); st.scoring.rankBasisRound = !!on; save(); render(); }
function stSetRankBasisHand(on){ var st = curStage(); st.scoring.rankBasisHand = !!on; save(); render(); }

/* ---------- 阶段积分 ---------- */
function stSetPointsOn(on){ var st = curStage(); st.points.on = !!on; save(); render(); }
function stSetPointsMode(v){ var st = curStage(); st.points.mode = v; save(); render(); }
function stSetPointsRankTable(v){
  var st = curStage();
  var arr = String(v).split(/[,，\s]+/).map(function(x){ return num(x); });
  if (!arr.length) return;
  st.points.rankTable = arr; save(); render();
}
function stSetPointsNum(k, v){ var st = curStage(); st.points[k] = num(v); save(); render(); }
function stSetPointsLinear(k, v){ var st = curStage(); st.points.linear[k] = num(v); save(); render(); }
function stSetPointsStack(on){ var st = curStage(); st.points.stack = !!on; save(); render(); }
function stSetPointsSpecial(k, v){ var st = curStage(); st.points.special[k] = num(v); save(); render(); }
function savePointsTemplate(){
  var st = curStage();
  if (!st.points.on){ toast('先开启「本阶段计入赛季积分」', 'err'); return; }
  promptBox('模板名称', '积分模板 ' + (DB.pointTemplates.length + 1), function(name){
    if (!name.trim()) return;
    DB.pointTemplates.push({ id: uid('pt'), name: name.trim(), rule: deepClone(st.points) });
    save(); closeModal(); toast('模板已保存', 'ok'); render();
  });
}
function loadPointsTemplate(){
  if (!DB.pointTemplates.length){ toast('还没有保存过模板'); return; }
  var h = '<div class="modal-title">载入积分模板</div><div class="list">';
  DB.pointTemplates.forEach(function(tpl){
    h += '<div class="rowline"><span class="label">' + esc(tpl.name)
       + ' <span class="tag gray">' + (tpl.rule.mode === 'LINEAR' ? '线性' : '名次表') + '</span></span>'
       + '<span><button class="btn xs primary" onclick="applyPointsTemplate(\'' + tpl.id + '\')">载入</button> '
       + '<button class="btn xs ghost" onclick="deletePointsTemplate(\'' + tpl.id + '\')">删除</button></span></div>';
  });
  h += '</div><div class="modal-actions"><button class="btn primary" onclick="closeModal()">关闭</button></div>';
  openModal(h);
}
function applyPointsTemplate(id){
  var st = curStage();
  var tpl = DB.pointTemplates.filter(function(x){ return x.id === id; })[0];
  if (!tpl) return;
  var rule = deepClone(tpl.rule);
  rule.on = true;
  st.points = rule;
  save(); closeModal(); toast('已载入模板：' + tpl.name, 'ok'); render();
}
function deletePointsTemplate(id){
  confirmBox('删除这个积分模板？', function(){
    DB.pointTemplates = DB.pointTemplates.filter(function(x){ return x.id !== id; });
    save(); closeModal(); toast('已删除', 'ok');
  }, { danger: true, yesText: '删除' });
}
function stSetScoringMode(v){ var st = curStage(); st.scoring.mode = v; save(); render(); }
function stSetRankSource(v){ var st = curStage(); st.scoring.rankSource = v; save(); render(); }
function stSetTable(key, arr){ var st = curStage(); st.scoring.rankTable[String(key)] = arr; save(); render(); }
function stSetRankTable(n, v){
  var st = curStage();
  var arr = String(v).split(/[,，\s]+/).map(function(x){ return num(x); });
  if (!arr.length) return;
  st.scoring.rankTable[String(n)] = arr;
  save(); render();
}
function stSetTopBonus(on){ var st = curStage(); st.scoring.topBonus.on = !!on; save(); render(); }
function stSetTopBonusValues(v){
  var st = curStage();
  var arr = String(v).split(/[,，\s]+/).map(function(x){ return num(x); });
  if (arr.length) st.scoring.topBonus.values = arr;
  save(); render();
}
function stSetWaterOn(on){ var st = curStage(); st.scoring.water.on = !!on; save(); render(); }
function stSetWater(k, v){ var st = curStage(); st.scoring.water[k] = num(v); save(); render(); }
function stSetElimCarry(on){ var st = curStage(); st.elim.carry = !!on; save(); render(); }
function stSetElimInitLosers(v){ var st = curStage(); st.elim.initialLosers = Math.max(0, Math.round(num(v) || 0)); save(); render(); }
function stSetGrandFinal(v){ var st = curStage(); st.elim.grandFinal = v; save(); render(); }
function stSetElimFill(on){ var st = curStage(); st.elim.fillUp = !!on; save(); render(); }
function stSetPerTable(v){ var st = curStage(); st.elim.perTable = num(v) === 1 ? 1 : 2; save(); render(); }
function stSetAdvType(v){ var st = curStage(); st.advance.type = v; save(); render(); }
function stSetAdvNum(key, v){ var st = curStage(); st.advance[key] = Math.max(0, num(v)); save(); render(); }
function stSetInherit(v){ var st = curStage(); st.inherit.mode = v; save(); render(); }
function stSetInheritRatio(v){ var st = curStage(); st.inherit.ratio = num(v); save(); render(); }
function stMoveTie(i, d){
  var st = curStage(), c = st.tiebreak.chain;
  var j = i + d; if (j < 0 || j >= c.length) return;
  var t = c[i]; c[i] = c[j]; c[j] = t; save(); render();
}
function stRemoveTie(i){ var st = curStage(); st.tiebreak.chain.splice(i, 1); save(); render(); }
function stAddTie(k){ if (!k) return; var st = curStage(); st.tiebreak.chain.push(k); save(); render(); }
