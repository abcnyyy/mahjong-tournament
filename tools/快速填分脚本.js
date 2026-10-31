// ============================================================
// 麻将赛事管理 · 测试用「快速填分」脚本 v2（适配本软件）
// ============================================================
// 用途：把「当前阶段·当前轮」所有桌、所有半庄的顺位与点数随机填满，
//       用来快速跑通登分 → 排名 → 晋级 → 赛季的流程（只是测试数据）。
//
// 用法：
//   1. 用浏览器打开 dist/麻将赛事管理.html（或 EXE / APK）
//   2. 进入某个赛事的某个阶段，点「编排登分」，先「开始第 N 轮」
//   3. F12 打开控制台 Console
//   4. 从本文件第 1 行开始 Ctrl+A 全选，粘贴到控制台，回车
//   5. 之后可反复调用：
//        QCFill.fillCurrent()   // 填当前轮
//        QCFill.fillStage()     // 填本阶段所有未确认轮次
//        QCFill.clearCurrent()  // 清空当前轮
//        QCFill.verify()        // 自检，返回问题数组（空数组=通过）
//        QCFill.CFG             // 配置对象，改完重新调用
//
// 填数规则：
//   - 同一桌 · 同一半庄内，点数之和 = 0（按 CFG.STEP 网格，默认 0.1）
//   - 点数不重复，顺位按点数从高到低 1..N
//   - 支持 2 / 3 / 4 人桌，局数按阶段设置自动读取
//   - 已确认的轮次不会被修改
// ============================================================
(function () {
  'use strict';

  var CFG = {
    STEP: 0.1,          // 点数精度：0.1 = 保留一位小数；1 = 整数
    MIN: -30,           // 单个半庄点数下限
    MAX: 30,            // 单个半庄点数上限
    OVERWRITE: true,    // false = 只填还没录过的局
    RENDER: true        // 填完自动重绘
  };

  function env() {
    if (typeof DB === 'undefined' || typeof curTournament !== 'function' ||
        typeof curStage !== 'function' || typeof save !== 'function' ||
        typeof render !== 'function') {
      throw new Error('不是本软件的页面：找不到 DB / curTournament / curStage / save / render');
    }
    var t = curTournament();
    var st = curStage();
    if (!t || !st) throw new Error('请先进入某个赛事的某个阶段');
    return { t: t, st: st };
  }

  function openRoundOf(st) {
    if (typeof openRound === 'function') return openRound(st);
    for (var i = st.rounds.length - 1; i >= 0; i--) {
      if (st.rounds[i].status !== 'confirmed') return st.rounds[i];
    }
    return null;
  }

  /* 生成 n 个和为 0 的点数（按 STEP 网格） */
  function genScores(n) {
    var unit = Math.max(1, Math.round(1 / CFG.STEP));
    var lo = Math.round(CFG.MIN * unit);
    var hi = Math.round(CFG.MAX * unit);
    var span = hi - lo;
    for (var attempt = 0; attempt < 800; attempt++) {
      var arr = [];
      var sum = 0;
      for (var i = 0; i < n - 1; i++) {
        var v = lo + Math.floor(Math.random() * (span + 1));
        arr.push(v);
        sum += v;
      }
      var last = -sum;
      if (last < lo || last > hi) continue;
      arr.push(last);
      /* 避免重复点数，顺位才有意义 */
      var seen = {};
      var dup = false;
      for (var k = 0; k < arr.length; k++) {
        if (seen[arr[k]]) { dup = true; break; }
        seen[arr[k]] = 1;
      }
      if (dup) continue;
      return arr.map(function (x) { return Math.round(x) / unit; });
    }
    /* 兜底：等差数列，和必然为 0 */
    var mid = (n - 1) / 2;
    var out = [];
    for (var j = 0; j < n; j++) out.push((mid - j) * CFG.STEP * 10);
    return out;
  }

  function fillRound(st, r) {
    var halves = st.halvesPerRound;
    r.tables.forEach(function (tb) {
      var seats = tb.seats.filter(function (s) { return s.pid; });
      if (seats.length < 2) return;
      for (var h = 0; h < halves; h++) {
        if (!CFG.OVERWRITE) {
          var used = seats.some(function (s) { return Number(s.scores[h]) !== 0; });
          if (used) continue;
        }
        var vals = genScores(seats.length);
        var idx = seats.map(function (s, i) { return i; });
        idx.sort(function (a, b) { return vals[b] - vals[a]; });
        for (var k = 0; k < seats.length; k++) {
          seats[k].scores[h] = vals[k];
        }
        for (var q = 0; q < idx.length; q++) {
          seats[idx[q]].ranks[h] = q + 1;
        }
      }
    });
    return r;
  }

  function fillCurrent() {
    var e = env();
    var r = openRoundOf(e.st);
    if (!r) throw new Error('当前阶段没有未确认的轮次');
    fillRound(e.st, r);
    save();
    if (CFG.RENDER) render();
    var msg = '已填第 ' + r.no + ' 轮（' + r.tables.length + ' 桌 × ' + e.st.halvesPerRound + ' 局）';
    if (typeof toast === 'function') toast(msg, 'ok');
    return msg;
  }

  function fillStage() {
    var e = env();
    var n = 0;
    e.st.rounds.forEach(function (r) {
      if (r.status === 'confirmed') return;
      fillRound(e.st, r);
      n++;
    });
    if (!n) throw new Error('本阶段没有未确认的轮次');
    save();
    if (CFG.RENDER) render();
    var msg = '已填本阶段 ' + n + ' 个轮次';
    if (typeof toast === 'function') toast(msg, 'ok');
    return msg;
  }

  function clearCurrent() {
    var e = env();
    var r = openRoundOf(e.st);
    if (!r) throw new Error('当前阶段没有未确认的轮次');
    r.tables.forEach(function (tb) {
      tb.seats.forEach(function (s) {
        for (var h = 0; h < e.st.halvesPerRound; h++) { s.scores[h] = 0; s.ranks[h] = 0; }
      });
    });
    save();
    if (CFG.RENDER) render();
    return '已清空第 ' + r.no + ' 轮';
  }

  function verify() {
    var e = env();
    var r = openRoundOf(e.st) || e.st.rounds[e.st.rounds.length - 1];
    if (!r) return ['没有轮次'];
    var problems = [];
    var halves = e.st.halvesPerRound;
    r.tables.forEach(function (tb, ti) {
      var seats = tb.seats.filter(function (s) { return s.pid; });
      for (var h = 0; h < halves; h++) {
        var sum = 0;
        seats.forEach(function (s) { sum += Number(s.scores[h]) || 0; });
        if (Math.abs(sum) > 1e-6) {
          problems.push('第 ' + (ti + 1) + ' 桌第 ' + (h + 1) + ' 局点数和 = ' + sum.toFixed(2));
        }
        var ranks = seats.map(function (s) { return Number(s.ranks[h]) || 0; }).sort(function (a, b) { return a - b; });
        for (var k = 0; k < ranks.length; k++) {
          if (ranks[k] !== k + 1) {
            problems.push('第 ' + (ti + 1) + ' 桌第 ' + (h + 1) + ' 局顺位应为 1..' + ranks.length);
            break;
          }
        }
      }
    });
    return problems;
  }

  window.QCFill = {
    CFG: CFG,
    fillCurrent: fillCurrent,
    fillStage: fillStage,
    clearCurrent: clearCurrent,
    verify: verify
  };

  try {
    var msg = fillCurrent();
    console.log('[QCFill] ' + msg + '；自检：' + (verify().length ? '有问题' : '通过'));
  } catch (err) {
    console.error('[QCFill] ' + err.message);
  }
})();
