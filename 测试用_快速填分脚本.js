// ============================================================
// 好奇杯赛事管理系统 · 测试用「快速填分」脚本 v1.1
// ============================================================
// 用途：一键把「当前轮次」所有桌、所有半庄的顺位与得分随机填满，
//       用于跑通赛事流程的功能测试（非网页内功能）。
//
// 用法（务必按顺序）：
//   ① 用 Edge/Chrome 打开《好奇杯赛事管理系统.html》
//   ② 进入某届赛事的「晋级赛」或「淘汰赛」页（必须已分桌）
//   ③ 按 F12 打开浏览器开发者工具，切到 Console（控制台）页
//   ④ 首次粘贴被 Chrome 拦截时，先输入 allow pasting 后回车
//   ⑤ 从第 1 行开始 Ctrl+A 全选本文件全部内容，粘贴到控制台，回车
//      ★ 警告：必须从第 1 行整段复制！只从中间 * 行开始复制会报
//        Unexpected token '*' 语法错误（本脚本全部使用 // 单行注释）
//   ⑥ 回车后即自动填写「当前轮」并通过自检
//   ⑦ 之后可反复点页面右下角工具条按钮，或直接在控制台调用：
//        QCFill.fillCurrent()   // 填当前轮
//        QCFill.fillAll()       // 填当前赛事全部已分桌轮次
//        QCFill.clearCurrent()  // 清空当前轮（顺位1、得分0）
//        QCFill.CFG             // 配置对象（可修改后重新调用）
//        QCFill.verify()        // 验证当前轮，返回问题数组（空=通过）
//
// 填数规则：
//   - 同一轮 · 同一桌 · 同一半庄内，顺位为 1~N 且互不重复
//   - 得分按顺位档位随机（第1位 15~30 / 第2位 0~15 / 第3位 -15~0 / 第4位 -30~-15）
//   - 同一轮 · 同一桌 · 同一半庄的得分之和恒为 0
//   - 每个半庄得分精确到小数点后一位（STEP=0.1）
// ============================================================
(function(){
'use strict';
// ---- 配置区（可改）----
var CFG={
  STEP:0.1,               // 得分粒度：0.1=保留1位小数（仍保证同桌同半庄总和0）；1=整数
  STRICT_DESC:false,      // true=强制「1位>2位>3位>4位」严格递减；默认 false 允许档位边界并列
  SKIP_WITHDRAWN:false,   // true=退赛选手不填（顺位留空、得分0），其余人按实际人数分配且总和仍为0
  CLEAR_TOP_MANUAL:true,  // true=清掉晋级赛「轮top加分」手动覆盖值，让系统自动加分生效
  RETRY:500,              // 拒绝采样次数（让分数分布更自然）；超过后走保底算法（保底必成功）
  SHOW_BAR:true,          // 是否在页面右下角注入工具条
  TIERS:{                 // 顺位 → [最低分, 最高分]
    4:[[15,30],[0,15],[-15,0],[-30,-15]],   // 4人桌
    3:[[15,30],[0,15],[-45,-15]],           // 3人桌：末位区间放宽，保证总和仍为0
    2:[[15,30],[-30,-15]]                   // 2人桌（极端情况兜底）
  }
};
var u=Math.max(1,Math.round(1/CFG.STEP));   // 整数网格系数，从根因避免浮点误差

// ---- 环境探测：避免在错误页面报无意义的错 ----
function envErr(){
  try{
    if(typeof DATA==='undefined'||typeof APP==='undefined'||typeof CONFIG==='undefined')return true;
    if(typeof saveData!=='function'||typeof render!=='function')return true;
    return false;
  }catch(e){return true;}
}

// ---- 随机排列 1..n ----
function perm(n){
  var a=[];
  for(var i=1;i<=n;i++)a.push(i);
  for(i=n-1;i>0;i--){
    var j=Math.floor(Math.random()*(i+1));
    var t=a[i];a[i]=a[j];a[j]=t;
  }
  return a;
}

// ---- 生成 n 个得分（第 i 个对应顺位 i+1 档位），总和恒 0 ----
function sampleZeroSum(n){
  var tiers=CFG.TIERS[n]||[[15,30],[0,15],[-45,-15]];
  var gs=tiers.map(function(t){return [Math.round(t[0]*u),Math.round(t[1]*u)];});
  // 拒绝采样：各档位独立均匀取值，命中总和为 0 即接受（分布自然）
  for(var attempt=0;attempt<CFG.RETRY;attempt++){
    var vals=[];
    for(var i=0;i<n;i++){
      var g=gs[i];
      vals.push(g[0]+Math.floor(Math.random()*(g[1]-g[0]+1)));
    }
    var sum=0;
    for(i=0;i<n;i++)sum+=vals[i];
    if(sum===0)return vals.map(function(v){return v/u;});
  }
  // 保底：可行区间逐位收缩 —— 第 i 位在「剩余区间」内取，末位由总和为 0 唯一确定，数学上必定成功
  var lo2=new Array(n),hi2=new Array(n),accLo=0,accHi=0;
  for(i=n-1;i>=0;i--){
    lo2[i]=accLo;hi2[i]=accHi;   // 第 i+1..n-1 位的累计最小/最大和
    accLo+=gs[i][0];accHi+=gs[i][1];
  }
  var res=new Array(n),cur=0;
  for(i=0;i<n-1;i++){
    var a=Math.max(gs[i][0],-cur-hi2[i]);
    var b=Math.min(gs[i][1],-cur-lo2[i]);
    if(b<a){a=gs[i][0];b=gs[i][1];}
    res[i]=a+Math.floor(Math.random()*(b-a+1));
    cur+=res[i];
  }
  res[n-1]=-cur;
  if(res[n-1]<gs[n-1][0])res[0]+=(res[n-1]-gs[n-1][0]),res[n-1]=gs[n-1][0];
  if(res[n-1]>gs[n-1][1])res[0]+=(res[n-1]-gs[n-1][1]),res[n-1]=gs[n-1][1];
  return res.map(function(v){return v/u;});
}

// ---- 取一组得分；STRICT_DESC=true 时强制严格递减 ----
function strictDesc(arr){
  for(var i=1;i<arr.length;i++)if(!(arr[i]<arr[i-1]))return false;
  return true;
}
function pickScores(n){
  for(var i=0;i<CFG.RETRY;i++){
    var s=sampleZeroSum(n);
    if(CFG.STRICT_DESC&&!strictDesc(s))continue;
    return s;
  }
  var s2=sampleZeroSum(n);
  if(CFG.STRICT_DESC&&!strictDesc(s2)){
    // 保底：逐位递减化，差额补回第一位（极端情况，仅 STRICT_DESC=true 时可能触发）
    for(var j=1;j<n;j++){
      if(!(s2[j]<s2[j-1]))s2[j]=s2[j-1]-CFG.STEP;
    }
    var delta=0;
    for(j=0;j<n;j++)delta+=s2[j];
    s2[0]-=delta;
  }
  return s2;
}

// ---- 定位当前轮次：优先跟随 APP.step 所在页签，否则取进度最新阶段 ----
function locate(){
  if(envErr())return {err:'当前页面不是好奇杯赛事管理系统，或脚本未加载完成。请先打开《好奇杯赛事管理系统.html》并刷新页面。'};
  var t=curT();
  if(!t)return {err:'请先进入一届赛事（赛事列表 → 进入）。'};
  var kind=null;
  if(APP.step==='qualifier')kind='qual';
  else if(APP.step==='elimination')kind='elim';
  else{
    var q=t.qualifier||{rounds:[]};
    var e=t.elimination;
    var unQ=0,unE=0;
    q.rounds.forEach(function(r){if(!r.confirmed)unQ++;});
    if(e)e.rounds.forEach(function(r){if(!r.confirmed)unE++;});
    if(unE>0)kind='elim';
    else if(unQ>0)kind='qual';
    else if(q.rounds.length)kind='qual';
    else if(e&&e.rounds.length)kind='elim';
  }
  if(!kind)return {err:'尚未分桌。请先在页面对应视图完成分桌后重试。'};
  var rounds=kind==='qual'?(t.qualifier||{rounds:[]}).rounds:(t.elimination||{rounds:[]}).rounds;
  var index=rounds.length-1;
  for(var i=rounds.length-1;i>=0;i--){if(!rounds[i].confirmed){index=i;break;}}
  if(index<0)index=rounds.length-1;
  if(index<0||!rounds[index])return {err:'尚未分桌。请先在页面对应视图完成分桌后重试。'};
  return {t:t,kind:kind,round:rounds[index],index:index,rounds:rounds};
}

// ---- 退赛选手是否跳过 ----
function skipPlayer(t,pid){
  if(!CFG.SKIP_WITHDRAWN)return false;
  var p=null;
  if(t&&t.players)p=t.players.find(function(x){return x.id===pid;});
  return !!(p&&p.withdrawn);
}

// ---- 填写一轮（所有桌所有半庄）----
function fillRound(round,kind){
  var loc=locate();
  if(loc.err)return {err:loc.err};
  var t=loc.t;
  var halfs=kind==='qual'?CONFIG.QUALIFY_MATCHES_PER_ROUND:CONFIG.ELIM_MATCHES_PER_ROUND;
  var skipped=[];
  round.tables.forEach(function(tb,ti){
    var active=tb.players.filter(function(pid){return !skipPlayer(t,pid);});
    var n=active.length;
    if(n<2){skipped.push('桌'+(ti+1)+'（有效'+n+'人）');return;}
    for(var h=0;h<halfs;h++){
      var ranks=perm(n);
      var scores=pickScores(n);
      active.forEach(function(pid,j){
        var d=tb.detail[pid];
        if(!d)d=tb.detail[pid]=(kind==='qual'?defaultQualDetail(getP(t,pid)):defaultElimDetail(getP(t,pid)));
        d.ranks[h]=ranks[j];
        d.scores[h]=scores[ranks[j]-1];   // 得分按顺位档位对应（scores[i] 属于顺位 i+1）
        if(kind==='qual'&&CFG.CLEAR_TOP_MANUAL)d.topBonusManual=null;
      });
      tb.players.forEach(function(pid){
        if(skipPlayer(t,pid)){
          var d=tb.detail[pid];
          if(d){d.ranks[h]='';d.scores[h]=0;}
        }
      });
    }
  });
  try{
    if(kind==='qual')computeQualRound(t,round);
    else computeElimRound(t,round);
  }catch(e){console.warn('[QCFill] 本轮计算异常（已忽略）：',e);}
  saveData();
  render();
  return {skipped:skipped};
}

// ---- 填「当前轮」----
function fillCurrent(){
  var loc=locate();
  if(loc.err){console.error('[QCFill]',loc.err);return {err:loc.err};}
  var res=fillRound(loc.round,loc.kind);
  var v=verifyRound(loc.round,loc.kind);
  if(v.length){
    v.forEach(function(x){console.error('[QCFill] 自检未通过：'+x);});
    return {ok:false,problems:v};
  }
  var label=loc.kind==='qual'?'晋级赛':'淘汰赛';
  console.log('[QCFill] 已填写第'+(loc.index+1)+'轮（'+label+'）并通过自检'+(res.skipped.length?'；跳过 '+res.skipped.join('、'):''));
  return {ok:true,kind:loc.kind,round:loc.index+1};
}

// ---- 填当前赛事全部已分桌轮次（晋级赛+淘汰赛）----
function fillAll(){
  var loc=locate();
  if(loc.err){console.error('[QCFill]',loc.err);return {err:loc.err};}
  var t=loc.t;
  var filled=[];
  var q=t.qualifier||{rounds:[]};
  q.rounds.forEach(function(r){
    if(!r.confirmed&&r.tables.length){fillRound(r,'qual');filled.push('晋级赛第'+r.roundNo+'轮');}
  });
  var e=t.elimination;
  if(e)e.rounds.forEach(function(r){
    if(!r.confirmed&&r.tables.length){fillRound(r,'elim');filled.push('淘汰赛第'+r.roundNo+'轮');}
  });
  if(!filled.length){console.log('[QCFill] 没有未确认的已分桌轮次。');return {ok:true,filled:[]};}
  console.log('[QCFill] 已填全部轮：'+filled.join('、'));
  return {ok:true,filled:filled};
}

// ---- 清空当前轮（全部置为顺位1、得分0）----
function clearCurrent(){
  var loc=locate();
  if(loc.err){console.error('[QCFill]',loc.err);return {err:loc.err};}
  loc.round.tables.forEach(function(tb){
    tb.players.forEach(function(pid){
      var d=tb.detail[pid];
      if(!d)return;
      var len=(d.scores||[]).length;
      for(var i=0;i<len;i++){d.ranks[i]=1;d.scores[i]=0;}
    });
  });
  try{
    if(loc.kind==='qual')computeQualRound(loc.t,loc.round);
    else computeElimRound(loc.t,loc.round);
  }catch(e){console.warn('[QCFill] 计算异常（已忽略）：',e);}
  saveData();
  render();
  console.log('[QCFill] 已清空当前轮（顺位1、得分0）。');
  return {ok:true};
}

// ---- 自检：顺位 1~N 不重复 + 各档位区间正确 + 每桌每半庄得分和 ==0 ----
function verifyRound(round,kind){
  var problems=[];
  var halfs=kind==='qual'?CONFIG.QUALIFY_MATCHES_PER_ROUND:CONFIG.ELIM_MATCHES_PER_ROUND;
  round.tables.forEach(function(tb,ti){
    for(var h=0;h<halfs;h++){
      var seen={},sum=0,activeN=0,tiers=null;
      tb.players.forEach(function(pid){
        var d=tb.detail[pid];
        if(!d)return;
        var rk=d.ranks?d.ranks[h]:null;
        if(rk===''||rk==null)return;
        rk=Number(rk);
        if(seen[rk])problems.push('桌'+(ti+1)+' 半庄'+(h+1)+'：顺位 '+rk+' 重复');
        seen[rk]=true;
        if(rk<1||rk>tb.players.length)problems.push('桌'+(ti+1)+' 半庄'+(h+1)+'：顺位 '+rk+' 超出范围');
        sum+=Number(d.scores[h]||0);
        activeN++;
      });
      if(activeN>=2&&Math.abs(sum)>0.0001)problems.push('桌'+(ti+1)+' 半庄'+(h+1)+'：得分和 '+sum+' ≠ 0');
      if(activeN>=2&&CFG.TIERS[activeN]){
        tiers=CFG.TIERS[activeN];
        tb.players.forEach(function(pid){
          var d=tb.detail[pid];
          if(!d)return;
          var rk=Number(d.ranks?d.ranks[h]:0);
          if(!rk)return;
          var sc=Number(d.scores[h]||0);
          var lo=tiers[rk-1][0],hi=tiers[rk-1][1];
          if(sc<lo-0.0001||sc>hi+0.0001)problems.push('桌'+(ti+1)+' 半庄'+(h+1)+'：顺位'+rk+' 得分 '+sc+' 不在档位 ['+lo+','+hi+'] 内');
        });
      }
    }
  });
  return problems;
}
function verify(){
  var loc=locate();
  if(loc.err){console.error('[QCFill]',loc.err);return [loc.err];}
  var v=verifyRound(loc.round,loc.kind);
  if(v.length)v.forEach(function(x){console.error('[QCFill] 自检未通过：'+x);});
  else console.log('[QCFill] 当前轮自检通过（顺位 1~N 不重复 · 各档位区间正确 · 每桌每半庄得分和 = 0）。');
  return v;
}

// ---- 右下角工具条 ----
function buildBar(){
  if(!CFG.SHOW_BAR)return;
  try{
    if(document.getElementById('qcFillBar'))return;
    var bar=document.createElement('div');
    bar.id='qcFillBar';
    bar.className='no-print';
    bar.style.cssText='position:fixed;right:12px;bottom:12px;z-index:99999;background:#ffffff;color:#000000;border:1px solid #cccccc;border-radius:8px;padding:8px 10px;box-shadow:0 2px 12px rgba(0,0,0,.25);font:13px "Microsoft YaHei",sans-serif;display:flex;gap:6px;align-items:center';
    var bs='background:#3498db;color:#fff;border:none;border-radius:5px;padding:4px 10px;cursor:pointer;font-size:13px';
    var bg='background:#95a5a6;color:#fff;border:none;border-radius:5px;padding:4px 10px;cursor:pointer;font-size:13px';
    bar.innerHTML='<span style="color:#666666;font-weight:bold">填分工具</span>'+
      '<button onclick="QCFill.fillCurrent()" style="'+bs+'">🎲 填当前轮</button>'+
      '<button onclick="QCFill.fillAll()" style="'+bs+'">🎲 填全部轮</button>'+
      '<button onclick="QCFill.clearCurrent()" style="'+bg+'">🧹 清空当前轮</button>'+
      '<button onclick="document.getElementById(\'qcFillBar\').remove()" style="'+bg+'">✖</button>';
    document.body.appendChild(bar);
  }catch(e){console.warn('[QCFill] 工具条注入失败（不影响填分功能）：',e);}
}

// ---- 对外 API ----
window.QCFill={
  fillCurrent:fillCurrent,
  fillAll:fillAll,
  clearCurrent:clearCurrent,
  CFG:CFG,
  sampleZeroSum:sampleZeroSum,
  pickScores:pickScores,
  locate:locate,
  verify:verify
};

// ---- 运行时即填当前轮（包 try/catch：异常可忽略，可手动点工具条重试）----
buildBar();
try{ fillCurrent(); }catch(e){ console.warn('[QCFill] 自动填当前轮失败，可手动点击工具条「🎲 填当前轮」重试：',e); }
})();
