'use strict';
/* =====================================================================
 * 10-ui-core.js  渲染框架 / 首页 / 设置 / 帮助
 * ===================================================================== */

function go(view, opts){
  opts = opts || {};
  APP.view = view;
  if (opts.tid !== undefined) APP.tid = opts.tid;
  if (opts.stageId !== undefined) APP.stageId = opts.stageId;
  if (opts.tab !== undefined) APP.tab = opts.tab;
  if (opts.seasonId !== undefined) APP.seasonId = opts.seasonId;
  APP.help = !!opts.help;
  if (view !== 'tournament') APP.tid = null;
  render();
  window.scrollTo(0, 0);
}
function render(){
  var app = document.getElementById('app');
  if (!app) return;
  try {
    var html = '';
    if (APP.view === 'home') html = viewHome();
    else if (APP.view === 'tournament') html = viewTournament();
    else if (APP.view === 'season') html = viewSeason();
    else if (APP.view === 'about') html = viewAbout();
    else html = viewHome();
    app.innerHTML = '<div class="app">' + html + '</div>';
    renderTopbar();
  } catch (e) {
    console.error(e);
    app.innerHTML = '<div class="app"><div class="card"><h2>页面出错了</h2><pre style="white-space:pre-wrap;font-size:12px;color:#b44">'
      + esc(e && e.stack || e) + '</pre><button class="btn primary" onclick="go(\'home\')">回首页</button></div></div>';
  }
}
function renderTopbar(){
  var bar = document.getElementById('topbar');
  if (!bar) return;
  var h;
  if (APP.view === 'home'){
    h = '<div class="topbar-inner"><div class="title">' + esc(siteName()) + '</div>'
      + '<button class="iconbtn" title="赛事数据" onclick="openDataMenu()">☰</button></div>';
  } else if (APP.view === 'season'){
    h = '<div class="topbar-inner"><button class="iconbtn" onclick="go(\'home\')">←</button>'
      + '<div class="title">' + esc((getSeason(APP.seasonId) || {}).name || '赛季') + '<span class="sub">赛季</span></div></div>';
  } else if (APP.view === 'about'){
    h = '<div class="topbar-inner"><button class="iconbtn" onclick="go(\'home\')">←</button><div class="title">使用说明</div></div>';
  } else {
    var t = curTournament();
    h = '<div class="topbar-inner"><button class="iconbtn" onclick="go(\'home\')">←</button>'
      + '<div class="title">' + esc(t ? t.name : '赛事') + '<span class="sub">' + (t && t.status === 'done' ? '已结束' : '进行中') + '</span></div>'
      + '<button class="iconbtn" onclick="openTournamentMenu()">⋯</button></div>';
  }
  bar.innerHTML = h;
}
function siteName(){
  return (DB && DB.settings && DB.settings.orgName) || APP_TITLE;
}

/* ---------- 通用小组件 ---------- */
function segHtml(name, options, current, onchangeFn){
  var h = '<div class="seg">';
  options.forEach(function(o){
    h += '<button class="' + (String(o[0]) === String(current) ? 'on' : '') + '" onclick="' + onchangeFn + '(\'' + o[0] + '\')">' + esc(o[1]) + '</button>';
  });
  return h + '</div>';
}
function tagHtml(text, cls){ return '<span class="tag ' + (cls || '') + '">' + esc(text) + '</span>'; }
function emptyHtml(icon, title, desc, btn){
  return '<div class="empty"><div class="big">' + icon + '</div><h3>' + esc(title) + '</h3><p>' + (desc || '') + '</p>'
    + (btn ? '<div class="btnrow" style="justify-content:center;margin-top:14px">' + btn + '</div>' : '') + '</div>';
}
function noticeHtml(text, cls){ return '<div class="notice ' + (cls || '') + '">' + text + '</div>'; }

/* ---------- 首页 ---------- */
function viewHome(){
  var h = '';
  h += '<div class="hero"><h1>' + esc(siteName()) + '</h1>'
     + '<p>本地运行的麻将赛事管理：多阶段多赛制、积分赛编排、淘汰赛、赛季积分、成绩导出。数据只存在本机。</p>'
     + '<div class="btnrow"><button class="btn primary" onclick="newTournamentDialog()">＋ 新建赛事</button>'
     + '<button class="btn" onclick="importDataDialog()">导入数据</button>'
     + '<button class="btn" onclick="loadDemo()">载入示例</button>'
     + '<button class="btn" onclick="go(\'about\')">使用说明</button></div></div>';

  /* 赛季 */
  var seasons = DB.seasons.slice();
  h += '<div class="card"><div class="card-h"><h2>赛季</h2><button class="btn sm ghost" onclick="newSeasonDialog()">＋ 新建赛季</button></div>';
  if (!seasons.length){
    h += '<div class="dim">还没有赛季。赛季用来汇总多场赛事的积分与直邀名单。</div>';
  } else {
    h += '<div class="list">';
    seasons.forEach(function(s){
      var board = computeSeasonBoard(s.id);
      var n = seasonTournaments(s.id).length;
      h += '<div class="item" onclick="go(\'season\',{seasonId:\'' + s.id + '\'})">'
         + '<div class="grow"><div class="name">' + esc(s.name) + '</div>'
         + '<div class="meta"><span>' + n + ' 场比赛</span><span>' + board.length + ' 位选手</span>'
         + (s.startDate ? '<span>' + esc(s.startDate) + (s.endDate ? ' ~ ' + esc(s.endDate) : '') + '</span>' : '')
         + '</div></div>'
         + '<div class="chev">›</div></div>';
    });
    h += '</div>';
  }
  h += '</div>';

  /* 赛事 */
  var list = DB.tournaments.slice().sort(function(a, b){ return b.createdAt - a.createdAt; });
  h += '<div class="card"><div class="card-h"><h2>赛事</h2>'
     + '<button class="btn sm ghost" onclick="importDataDialog()">导入</button>'
     + '<button class="btn sm ghost" onclick="exportAllData()">导出全部</button></div>';
  if (!list.length){
    h += emptyHtml('🀄', '还没有赛事', '点「新建赛事」创建第一场比赛；也可以导入之前导出的 JSON 数据。',
      '<button class="btn primary" onclick="newTournamentDialog()">新建赛事</button>');
  } else {
    h += '<div class="list">';
    list.forEach(function(t){
      var stageTxt = t.stages.length ? t.stages.length + ' 个阶段' : '未设置阶段';
      var season = getSeason(t.seasonId);
      var players = t.players.length + ' 人';
      h += '<div class="item" onclick="openTournament(\'' + t.id + '\')">'
         + '<div class="grow"><div class="name">' + esc(t.name) + ' '
         + (t.status === 'done' ? tagHtml('已结束', 'gray') : tagHtml('进行中', 'brand')) + '</div>'
         + '<div class="meta"><span>' + esc(fmtDate(t.createdAt)) + '</span><span>' + players + '</span><span>' + stageTxt + '</span>'
         + (season ? '<span>赛季：' + esc(season.name) + '</span>' : '') + '</div></div>'
         + '<div class="chev">›</div></div>';
    });
    h += '</div>';
  }
  h += '</div>';
  return h;
}

/* ---------- 帮助 ---------- */
function viewAbout(){
  var h = '<div class="card"><h2>使用流程</h2><div class="dim" style="line-height:1.9">'
    + '<p><b>1. 建赛事</b>：填名字，选赛季（可空）。</p>'
    + '<p><b>2. 导入选手</b>：选手池里批量粘贴，每行一个「名字」或「UID 名字」。</p>'
    + '<p><b>3. 加阶段</b>：一个赛事可以有很多阶段，每个阶段独立设置赛制（积分赛/单败/双败）、桌人数、轮数、每轮局数、计分、破同分、晋级规则、分数继承。</p>'
    + '<p><b>4. 编排</b>：积分赛可选随机/高高碰/分层抽签/分档抽签/循环赛；淘汰赛自动蛇形种子。</p>'
    + '<p><b>5. 登分</b>：每桌每局录顺位与点数，另有加分/扣分/迟到/缺席的手动修正栏。确认本轮后才能进下一轮。</p>'
    + '<p><b>6. 排名与晋级</b>：按设定的计分与破同分算出名次，按晋级规则进入下一阶段，可继承分数。</p>'
    + '<p><b>7. 赛季</b>：多个赛事归到一个赛季，按名次自动算积分，可手动覆盖。</p>'
    + '<p><b>8. 导出</b>：名单、成绩、对阵图、PDF/HTML、JSON 备份，以及雀魂牌谱 CSV 导入。</p></div></div>';
  h += '<div class="card"><h2>数据安全</h2><div class="dim" style="line-height:1.9">'
    + '<p>所有数据只存在本机（浏览器 localStorage，EXE/APK 另存本地文件）。'
    + '建议每次赛事结束后用「导出全部数据」备份一份 JSON。</p></div>'
    + '<div class="btnrow" style="margin-top:12px"><button class="btn" onclick="exportAllData()">导出全部数据</button>'
    + '<button class="btn ghost" onclick="importDataDialog()">导入数据</button></div></div>';
  return h;
}

/* ---------- 赛事菜单 ---------- */
function openTournamentMenu(){
  var t = curTournament();
  if (!t) return;
  var h = '<div class="modal-title">' + esc(t.name) + '</div>';
  h += '<div class="btnrow" style="flex-direction:column;align-items:stretch">';
  h += '<button class="btn ghost" onclick="renameTournament()">✎ 重命名</button>';
  h += '<button class="btn ghost" onclick="changeTournamentSeason()">🗓 选择赛季</button>';
  h += '<button class="btn ghost" onclick="toggleTournamentStatus()">' + (t.status === 'done' ? '↩ 重新打开赛事' : '✔ 标记为已结束') + '</button>';
  h += '<button class="btn ghost" onclick="exportTournamentDialog()">⬇ 导出/打印</button>';
  h += '<button class="btn danger" onclick="deleteTournament()">🗑 删除赛事</button>';
  h += '</div><div class="modal-actions"><button class="btn primary" onclick="closeModal()">关闭</button></div>';
  openModal(h);
}
function openDataMenu(){
  var h = '<div class="modal-title">赛事数据</div><div class="btnrow" style="flex-direction:column;align-items:stretch">'
    + '<button class="btn ghost" onclick="closeModal();newTournamentDialog()">＋ 新建赛事</button>'
    + '<button class="btn ghost" onclick="closeModal();newSeasonDialog()">＋ 新建赛季</button>'
    + '<button class="btn ghost" onclick="closeModal();exportAllData()">⬇ 导出全部数据</button>'
    + '<button class="btn ghost" onclick="closeModal();importDataDialog()">⬆ 导入数据</button>'
    + '<button class="btn ghost" onclick="closeModal();orgNameDialog()">✎ 修改系统名称</button>'
    + '<button class="btn ghost" onclick="closeModal();go(\'about\')">? 使用说明</button>'
    + '<button class="btn danger" onclick="closeModal();resetAllData()">清空全部数据</button>'
    + '</div><div class="modal-actions"><button class="btn primary" onclick="closeModal()">关闭</button></div>';
  openModal(h);
}
function resetAllData(){
  confirmBox('清空全部赛事、赛季与成绩？请先导出备份，此操作不可恢复。', function(){
    DB = newDB();
    saveNow(); closeModal(); go('home');
    toast('已清空', 'ok');
  }, { danger: true, yesText: '全部清空' });
}
function orgNameDialog(){
  promptBox('系统/主办方名称（显示在首页和导出标题）', DB.settings.orgName || APP_TITLE, function(v){
    DB.settings.orgName = v.trim() || APP_TITLE;
    save(); render();
  }, { title: '系统名称' });
}
function newTournamentDialog(){
  var seasonOpts = '<option value="">（不归属赛季）</option>';
  DB.seasons.forEach(function(s){
    seasonOpts += '<option value="' + s.id + '"' + (s.id === DB.activeSeasonId ? ' selected' : '') + '>' + esc(s.name) + '</option>';
  });
  var h = '<div class="modal-title">新建赛事</div>'
    + '<div class="field"><label>赛事名称</label><input class="input" id="tnName" data-autofocus placeholder="例如：2026 春季赛 第三场"></div>'
    + '<div class="field"><label>归属赛季</label><select class="input" id="tnSeason">' + seasonOpts + '</select></div>'
    + '<div class="modal-actions"><button class="btn ghost" onclick="closeModal()">取消</button>'
    + '<button class="btn primary" onclick="createTournament()">创建</button></div>';
  openModal(h);
}
function createTournament(){
  var name = (document.getElementById('tnName').value || '').trim();
  if (!name) { toast('请填写赛事名称', 'err'); return; }
  var sid = document.getElementById('tnSeason').value;
  var t = newTournament(name, sid);
  DB.tournaments.push(t);
  save();
  closeModal();
  openTournament(t.id);
}
function openTournament(id){
  APP.tid = id;
  APP.view = 'tournament';
  var t = getTournament(id);
  APP.stageId = t && t.stages.length ? t.stages[0].id : null;
  APP.tab = t && t.stages.length ? 'config' : 'players';
  render();
  window.scrollTo(0, 0);
}
function renameTournament(){
  var t = curTournament();
  promptBox('赛事名称', t.name, function(v){
    if (!v.trim()) return;
    t.name = v.trim(); save(); closeModal(); render();
  });
}
function changeTournamentSeason(){
  var t = curTournament();
  var opts = '<option value="">（不归属赛季）</option>';
  DB.seasons.forEach(function(s){
    opts += '<option value="' + s.id + '"' + (s.id === t.seasonId ? ' selected' : '') + '>' + esc(s.name) + '</option>';
  });
  var h = '<div class="modal-title">选择赛季</div><div class="field"><select class="input" id="tSeason">' + opts + '</select></div>'
    + '<div class="modal-actions"><button class="btn ghost" onclick="closeModal()">取消</button>'
    + '<button class="btn primary" onclick="doChangeSeason()">确定</button></div>';
  openModal(h);
}
function doChangeSeason(){
  var t = curTournament();
  t.seasonId = document.getElementById('tSeason').value;
  save(); closeModal(); render();
}
function toggleTournamentStatus(){
  var t = curTournament();
  if (t.status !== 'done'){
    if (t.stages.length){
      confirmBox('标记为已结束后，本场积分会进入赛季榜。确定？', function(){
        finishTournament(t); save(); closeModal(); render();
      });
    } else { t.status = 'done'; save(); closeModal(); render(); }
  } else {
    t.status = 'ongoing'; save(); closeModal(); render();
  }
}
function deleteTournament(){
  var t = curTournament();
  confirmBox('删除「' + t.name + '」及其全部阶段、成绩？此操作不可恢复。', function(){
    DB.tournaments = DB.tournaments.filter(function(x){ return x.id !== t.id; });
    save(); closeModal(); go('home');
  }, { danger: true, yesText: '删除' });
}

/* ---------- 示例数据 ---------- */
function loadDemo(){
  confirmBox('载入一个示例赛事（16 人、积分赛 + 单败淘汰 + 赛季）用来熟悉界面？现有数据不会删除。', function(){
    var se = newSeason('示例赛季');
    se.id = uid('se');
    DB.seasons.push(se);
    var t = newTournament('示例赛事 · 立直麻将', se.id);
    var names = ['小铃','阿知贺','原村和','宫永咲','竹井久','染谷真子','薄墨初美','江口夕',
                 '清水谷龙华','园城寺怜','天江衣','妹尾佳奈美','HC','藤田靖子','nagisa','まる'];
    names.forEach(function(n, i){ t.players.push(newPlayer(n, { source: i < 4 ? 'invite' : 'manual' })); });
    var st = newStage('POINTS', '积分赛');
    st.roundCount = 3; st.halvesPerRound = 2; st.advance.n = 4;
    t.stages.push(st);
    var el = newStage('SINGLE', '单败淘汰');
    el.seats = 4; el.halvesPerRound = 2; el.elim.perTable = 2;
    t.stages.push(el);
    DB.tournaments.push(t);
    APP.tid = t.id; APP.stageId = st.id; APP.tab = 'entry'; APP.view = 'tournament';
    ensureEntrants(t, st);
    startPointsRound(t, st);
    save(); closeModal(); render();
    toast('示例已载入，可直接录分试试', 'ok');
  });
}
