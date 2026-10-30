'use strict';
/* =====================================================================
 * 01-util.js  基础工具 / 弹窗 / 存储
 * ===================================================================== */

var STORE_KEY = 'mtt2_data';
var APP_TITLE = '麻将赛事管理';
var WINDS = ['东', '南', '西', '北'];

/* ---------- 基础 ---------- */
function uid(p){ return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function num(v){ var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function fmt(n, digits){
  if (n == null || isNaN(n)) return '0';
  var d = digits == null ? 2 : digits;
  var v = Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
  var s = String(v);
  if (s.indexOf('.') >= 0) s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}
function round2(n){ return Math.round(n * 100) / 100; }
function clamp(n, a, b){ return n < a ? a : (n > b ? b : n); }
function sum(arr){ var s = 0; for (var i = 0; i < arr.length; i++) s += num(arr[i]); return s; }
function deepClone(o){ return JSON.parse(JSON.stringify(o)); }
function pad2(n){ return n < 10 ? '0' + n : '' + n; }
function fmtDate(ts){
  var d = new Date(ts);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function fmtDateTime(ts){
  var d = new Date(ts);
  return fmtDate(ts) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function stamp(){
  var d = new Date();
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
}
function hashStr(s){
  s = String(s);
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
/* 确定性洗牌：同一 seed 结果可复现 */
function shuffle(arr, seed){
  var a = arr.slice(), i, j, t, x = (seed == null ? (Date.now() & 0x7fffffff) : seed | 0);
  function rnd(){ x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff; return x; }
  for (i = a.length - 1; i > 0; i--) {
    j = rnd() % (i + 1); t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function sortByKey(arr, fn, desc){
  return arr.slice().sort(function(a, b){
    var x = fn(a), y = fn(b);
    if (x === y) return 0;
    if (desc) return y > x ? 1 : -1;
    return x > y ? 1 : -1;
  });
}
function uniq(arr){
  var seen = {}, out = [];
  for (var i = 0; i < arr.length; i++){ if (!seen[arr[i]]){ seen[arr[i]] = 1; out.push(arr[i]); } }
  return out;
}
function pairKey(a, b){ return a < b ? a + '|' + b : b + '|' + a; }

/* ---------- 文件 ---------- */
function downloadText(name, text, mime){
  var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  if (window.MTTBridge && window.MTTBridge.saveFile){
    try {
      var r = new FileReader();
      r.onload = function(){
        try { window.MTTBridge.saveFile(name, String(r.result).replace(/^data:[^,]*,/, '')); toast('已保存：' + name); }
        catch(e){ fallbackDownload(name, blob); }
      };
      r.readAsDataURL(blob);
      return;
    } catch(e){}
  }
  fallbackDownload(name, blob);
}
function fallbackDownload(name, blob){
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function pickTextFile(accept, cb){
  var inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = accept || '.json,.csv,.txt';
  inp.style.display = 'none';
  inp.onchange = function(){
    var f = inp.files && inp.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function(){ cb(String(r.result), f.name); };
    r.readAsText(f, 'UTF-8');
    setTimeout(function(){ inp.remove(); }, 100);
  };
  document.body.appendChild(inp);
  inp.click();
}

/* ---------- 存储 ---------- */
var Store = (function(){
  var B = null;
  function bridge(){
    if (B === null) B = window.MTTBridge || false;
    return B || null;
  }
  function readRaw(){
    var b = bridge();
    if (b && b.load){ try { var s = b.load(); if (s) return s; } catch(e){ console.warn('bridge load 失败', e); } }
    try { return localStorage.getItem(STORE_KEY); } catch(e){ return null; }
  }
  function writeRaw(s){
    var b = bridge();
    if (b && b.save){ try { b.save(s); } catch(e){ console.warn('bridge save 失败', e); } }
    try { localStorage.setItem(STORE_KEY, s); } catch(e){ console.warn('localStorage 保存失败', e); }
  }
  var pending = null;
  return {
    read: readRaw,
    write: writeRaw,
    save: function(db){
      try { writeRaw(JSON.stringify(db)); } catch(e){ console.error(e); }
    },
    /* 防抖保存 */
    queue: function(db){
      pending = db;
      if (pending) { clearTimeout(Store._t); }
      Store._t = setTimeout(function(){ if (pending){ Store.save(pending); pending = null; } }, 120);
    }
  };
})();

/* ---------- 提示 / 弹窗 ---------- */
function toast(msg, type){
  var root = document.getElementById('toastRoot');
  if (!root) return;
  var d = document.createElement('div');
  d.className = 'toast ' + (type || '');
  d.textContent = msg;
  root.appendChild(d);
  setTimeout(function(){ d.classList.add('out'); }, 1800);
  setTimeout(function(){ d.remove(); }, 2300);
}
function modalRoot(){ return document.getElementById('modalRoot'); }
var _modalStack = [];
function openModal(html, opts){
  opts = opts || {};
  var root = modalRoot();
  var wrap = document.createElement('div');
  wrap.className = 'modal-mask' + (opts.cls ? ' ' + opts.cls : '');
  wrap.innerHTML = '<div class="modal-box" role="dialog" aria-modal="true">' + html + '</div>';
  function onMask(e){ if (e.target === wrap && opts.closable !== false) closeModal(); }
  wrap.addEventListener('mousedown', onMask);
  root.appendChild(wrap);
  _modalStack.push({ wrap: wrap, onClose: opts.onClose });
  var box = wrap.querySelector('.modal-box');
  if (box){
    var focusEl = box.querySelector('[data-autofocus]') || box.querySelector('input,textarea,select');
    if (focusEl) setTimeout(function(){ try { focusEl.focus(); } catch(e){} }, 30);
  }
  return wrap;
}
function closeModal(){
  var top = _modalStack.pop();
  if (!top) return;
  if (top.wrap && top.wrap.parentNode) top.wrap.parentNode.removeChild(top.wrap);
  if (top.onClose) { try { top.onClose(); } catch(e){ console.error(e); } }
}
function closeAllModals(){ while (_modalStack.length) closeModal(); }
function modalBusy(v){
  var root = modalRoot();
  if (!root) return;
  var btns = root.querySelectorAll('.modal-box button');
  for (var i = 0; i < btns.length; i++) btns[i].disabled = !!v;
}
function alertBox(msg, cb){
  openModal('<div class="modal-title">提示</div><div class="modal-body">' + esc(msg).replace(/\n/g, '<br>') + '</div>'
    + '<div class="modal-actions"><button class="btn primary" onclick="closeModal()">知道了</button></div>',
    { onClose: cb });
}
function confirmBox(msg, onYes, opts){
  opts = opts || {};
  var buttons = '<button class="btn ghost" onclick="closeModal()">' + esc(opts.cancelText || '取消') + '</button>'
              + '<button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" id="confirmYes">' + esc(opts.yesText || '确定') + '</button>';
  var w = openModal('<div class="modal-title">' + esc(opts.title || '确认') + '</div>'
    + '<div class="modal-body">' + esc(msg).replace(/\n/g, '<br>') + '</div>'
    + '<div class="modal-actions">' + buttons + '</div>');
  w.querySelector('#confirmYes').onclick = function(){ closeModal(); if (onYes) onYes(); };
}
function promptBox(msg, def, onOk, opts){
  opts = opts || {};
  var w = openModal('<div class="modal-title">' + esc(opts.title || '输入') + '</div>'
    + '<div class="modal-body"><div class="dim" style="margin-bottom:6px">' + esc(msg).replace(/\n/g, '<br>') + '</div>'
    + '<input class="input" id="promptInput" data-autofocus value="' + esc(def == null ? '' : def) + '"></div>'
    + '<div class="modal-actions"><button class="btn ghost" onclick="closeModal()">取消</button>'
    + '<button class="btn primary" id="promptOk">确定</button></div>');
  var inp = w.querySelector('#promptInput');
  function ok(){ var v = inp.value; closeModal(); if (onOk) onOk(v); }
  w.querySelector('#promptOk').onclick = ok;
  inp.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); ok(); } });
  setTimeout(function(){ try { inp.select(); } catch(e){} }, 40);
}

/* ---------- 小工具 ---------- */
function $(sel, root){ return (root || document).querySelector(sel); }
function $$(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function debounce(fn, ms){
  var t;
  return function(){ var a = arguments, self = this; clearTimeout(t); t = setTimeout(function(){ fn.apply(self, a); }, ms || 200); };
}
