const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');

const file = path.join(__dirname, '..', '..', 'dist', '麻将赛事管理.html');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  const logs = [];
  win.webContents.on('console-message', (e, level, msg) => { if (level >= 2) logs.push('[console] ' + msg); });
  win.webContents.on('render-process-gone', (e, d) => { console.log('RENDER GONE', JSON.stringify(d)); });
  await win.loadFile(file);

  const script = `(function(){
    var out = [];
    function log(){ out.push(Array.prototype.join.call(arguments, ' ')); }
    try {
      DB = newDB();
      var se = newSeason('测试赛季'); se.id = 'se1'; DB.seasons.push(se);
      var t = newTournament('测试赛', 'se1');
      for (var i = 1; i <= 16; i++) t.players.push(newPlayer('P' + i));
      DB.tournaments.push(t);
      APP.tid = t.id; APP.view = 'tournament';

      /* ---- 积分赛 2 轮 ---- */
      var st = newStage('POINTS', '积分赛');
      st.roundCount = 2; st.halvesPerRound = 2; st.advance.n = 8;
      st.pairing.mode = 'SWISS';
      t.stages.push(st); APP.stageId = st.id;
      ensureEntrants(t, st);
      log('entrants', st.entrants.length);

      function fillRound(st, r, seedv){
        var n = 0;
        r.tables.forEach(function(tb, ti){
          var scores = tb.seats.map(function(s, si){
            return 25000 + (si * 1000) + (ti * 100) + (seedv * 10);
          });
          var order = tb.seats.slice().sort(function(a,b){ var ia=tb.seats.indexOf(a), ib=tb.seats.indexOf(b); return scores[ib]-scores[ia]; });
          tb.seats.forEach(function(s, si){
            var idx = tb.seats.indexOf(s);
            s.scores[0] = scores[si];
            s.scores[1] = scores[si] - 500;
            var rank = 1 + tb.seats.filter(function(x){ return scores[tb.seats.indexOf(x)] > scores[si]; }).length;
            s.ranks[0] = rank; s.ranks[1] = rank;
            n++;
          });
        });
        return n;
      }

      startPointsRound(t, st);
      log('r1 tables', st.rounds[0].tables.length);
      fillRound(st, st.rounds[0], 1);
      st.rounds[0].status = 'confirmed';

      startPointsRound(t, st);
      fillRound(st, st.rounds[1], 2);
      st.rounds[1].status = 'confirmed';

      var rows = stageRanking(t, st);
      log('rank rows', rows.length, 'top', rows[0].pid, rows[0].point, 'avgRank', rows[0].avgRank);
      var adv = computeAdvancers(t, st, rows);
      st.advancers = adv;
      log('advancers', adv.length);

      /* ---- 单败 8 人 ---- */
      var e1 = newStage('SINGLE', '单败');
      e1.seats = 4; e1.halvesPerRound = 2; e1.elim.perTable = 2; e1.advance.n = 4;
      e1.entrants = adv.slice();
      t.stages.push(e1); APP.stageId = e1.id;
      ensureEntrants(t, e1);
      log('elim entrants', e1.entrants.length);

      var guard = 0;
      while (guard++ < 10) {
        var rr = startElimRound(t, e1);
        if (!rr) break;
        log('elim round', rr.no, rr.type, 'tables', rr.tables.length, 'seats', rr.tables.map(function(x){return x.seats.length;}).join(','));
        fillRound(e1, rr, rr.no);
        confirmElimRound(t, e1, rr);
        log('  adv', (rr.adv||[]).length);
        if (e1.elimState.done) break;
      }
      var fin = elimFinalRanking(t, e1);
      log('final ranking', fin.length, fin.slice(0,4).join(','));

      /* ---- 双败 16 人 ---- */
      var t2 = newTournament('双败测试', 'se1');
      for (var j = 1; j <= 16; j++) t2.players.push(newPlayer('Q' + j));
      DB.tournaments.push(t2);
      var e2 = newStage('DOUBLE', '双败');
      e2.seats = 4; e2.halvesPerRound = 2; e2.elim.perTable = 2; e2.advance.n = 4;
      t2.stages.push(e2); APP.tid = t2.id; APP.stageId = e2.id;
      ensureEntrants(t2, e2);
      var guard2 = 0;
      while (guard2++ < 14) {
        var r2 = startElimRound(t2, e2);
        if (!r2) break;
        log('db round', r2.no, r2.type, 'tables', r2.tables.length, 'seats', r2.tables.map(function(x){return x.seats.length;}).join(','));
        fillRound(e2, r2, r2.no);
        confirmElimRound(t2, e2, r2);
        if (e2.elimState.done) break;
      }
      var fin2 = elimFinalRanking(t2, e2);
      log('double final', fin2.length, fin2.slice(0,4).join(','));

      /* ---- 赛季 ---- */
      finishTournament(t);
      var board = computeSeasonBoard('se1');
      log('season board', board.length, 'top', board[0] && board[0].name, board[0] && board[0].total);

      /* ---- 渲染各页面 ---- */
      APP.view = 'home'; render(); log('home html', document.querySelector('#app').innerHTML.length);
      APP.view = 'tournament'; APP.tid = t.id; APP.stageId = st.id;
      ['entry','rank','config','advance'].forEach(function(tab){ APP.tab = tab; render(); log('tab', tab, document.querySelector('#app').innerHTML.length); });
      APP.tab = 'bracket'; render(); log('bracket', document.querySelector('#app').innerHTML.length);
      APP.view = 'season'; APP.seasonId = 'se1'; render(); log('season', document.querySelector('#app').innerHTML.length);
      log('DONE');
    } catch (e) {
      log('ERROR', e && e.stack || e);
    }
    return out.join('\\n');
  })()`;

  try {
    const res = await win.webContents.executeJavaScript(script);
    console.log(res);
  } catch (e) {
    console.log('EXEC FAIL', e && e.message);
  }
  if (logs.length) console.log(logs.join('\n'));
  app.quit();
});
