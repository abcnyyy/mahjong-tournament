'use strict';
/* =====================================================================
 * 16-init.js  启动 / 事件绑定
 * ===================================================================== */

var OLD_KEY = 'curious_cup_data';

function boot(){
  var raw = Store.read();
  var d = null;
  if (raw){
    try { d = JSON.parse(raw); } catch(e){ d = null; }
  }
  if (!d){
    /* 尝试从旧版数据迁移 */
    var oldRaw = null;
    try { oldRaw = localStorage.getItem(OLD_KEY); } catch(e){}
    if (oldRaw){
      try {
        var old = JSON.parse(oldRaw);
        if (old && old.tournaments){
          DB = migrateOldData(old);
          saveNow();
          setTimeout(function(){
            confirmBox('检测到旧版「好奇杯」数据（' + old.tournaments.length + ' 场赛事），已自动转换为新格式。是否继续使用？', function(){}, { yesText: '知道了', cancelText: '隐藏' });
          }, 300);
        }
      } catch(e){ console.warn('旧数据迁移失败', e); }
    }
    if (!DB) DB = newDB();
  } else {
    DB = normalizeDB(d);
  }
  if (!DB.activeSeasonId && DB.seasons.length) DB.activeSeasonId = DB.seasons[0].id;

  /* 记录最近一次状态，便于跨页恢复 */
  app_bind();
  render();

  /* 保存时机 */
  window.addEventListener('pagehide', saveNow);
  window.addEventListener('beforeunload', saveNow);
  document.addEventListener('visibilitychange', function(){ if (document.hidden) saveNow(); });

  if (!DB.seenWelcome){
    DB.seenWelcome = true;
    save();
  }
}
function app_bind(){
  var app = document.getElementById('app');
  if (!app || app._bound) return;
  app._bound = true;
  function onInput(e){
    if (onEntryInput && e.target && e.target.getAttribute && e.target.getAttribute('data-field')) onEntryInput(e);
  }
  app.addEventListener('change', function(e){
    if (onEntryInput && e.target && e.target.getAttribute && e.target.getAttribute('data-field')) onEntryInput(e, false);
  });
  app.addEventListener('input', function(e){
    var el = e.target;
    if (el && el.getAttribute && el.getAttribute('data-field')) onEntryInput(e, true);
  });
  /* 输入框回车跳到下一个 */
  app.addEventListener('keydown', function(e){
    if (e.key !== 'Enter') return;
    var el = e.target;
    if (!el || !el.getAttribute || !el.getAttribute('data-field')) return;
    e.preventDefault();
    var inputs = Array.prototype.slice.call(document.querySelectorAll('[data-field]'));
    var i = inputs.indexOf(el);
    if (i >= 0 && inputs[i + 1]){ inputs[i + 1].focus(); inputs[i + 1].select && inputs[i + 1].select(); }
  });
}
document.addEventListener('DOMContentLoaded', function(){
  try { boot(); } catch(e){
    console.error(e);
    document.getElementById('app').innerHTML = '<div class="app"><div class="card"><h2>启动失败</h2><pre style="white-space:pre-wrap;font-size:12px">' + esc(e && e.stack || e) + '</pre></div></div>';
  }
});
