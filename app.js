(() => {
  const $ = id => document.getElementById(id);
  const equation = $('equation'), tolInput = $('tolerance'), maxInput = $('max-iterations'), decimalPlacesInput = $('decimal-places');
  const methodPicker = $('method-picker');
  let mode = 'compare', singleMethodId = 1;
  const aInput = $('param-a'), bInput = $('param-b'), bracketA = $('bracket-a'), bracketB = $('bracket-b'), solveButton = $('solve-button');
  const errorBox = $('input-error'), table = $('iteration-table');
  const names = {1:'Bisection',2:'Newton–Raphson',3:'Secant'};
  const keys = {1:'bis',2:'newton',3:'secant'};
  const colors = {1:'#f5a623',2:'#35c9ed',3:'#c58aff'};
  let wasm = null, results = {}, selectedTab = 1, lastExpr = '', lastTolerance = 0.001;
  const places = () => Math.max(0, Math.min(12, Number(decimalPlacesInput?.value ?? 4) || 0));
  const fmt = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(places()) : '—';
  const plain = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(places()) : '—';
  function setError(msg){errorBox.textContent=msg;errorBox.classList.toggle('hidden',!msg)}
  function ensureWasm(){
    if(wasm) return Promise.resolve(wasm);
    if(typeof createSolverModule!=='function') return Promise.reject(new Error('solver.js is missing. Compile solver.cpp with Emscripten, then upload solver.js and solver.wasm too.'));
    return createSolverModule({print:()=>{},printErr:()=>{}}).then(m=>(wasm=m));
  }
  function runOne(m, expr, a, b, tol, maxIter){
    const ptr=m.stringToNewUTF8(expr), start=performance.now(); let out;
    try { out=m._solve(ptr, Number(m.__method), a, b, tol, maxIter); } finally {m._free(ptr)}
    const elapsed=performance.now()-start;
    if(!out) throw new Error('Could not allocate memory for solver output.');
    let text; try{text=m.UTF8ToString(out)}finally{m._free(out)}
    const result=JSON.parse(text); result.elapsedMs=elapsed;
    return result;
  }
  async function solveMethod(m, methodId, expr, a, b, tol, maxIter){
    m.__method=methodId;
    return runOne(m,expr,a,b,tol,maxIter);
  }
  function candidate(row, methodId){ return row[methodId===1?3:methodId===2?4:5]; }
  function history(result, methodId){
    if(!result) return [];
    return (result.rows||[]).map(row=>({x:candidate(row,methodId), residual:Math.abs(row[methodId===1?4:methodId===2?5:6]), iteration:row[0]})).filter(p=>Number.isFinite(p.x));
  }
  function estimateOrder(points, root){
    const errs=points.map(p=>Math.max(Math.abs(p.x-root),Number.MIN_VALUE)).filter(Number.isFinite);
    if(errs.length<3) return '—';
    const e=errs.slice(-3); if(e.some(x=>x<=1e-14)) return '≈ quadratic';
    const denom=Math.log(e[1]/e[0]); if(!Number.isFinite(denom)||Math.abs(denom)<1e-12) return '—';
    const order=Math.log(e[2]/e[1])/denom;
    return Number.isFinite(order)&&order>0&&order<5 ? `≈ ${order.toFixed(2)}` : '—';
  }
  function renderCard(id, r, methodId){
    const k=keys[methodId]; const h=history(r,methodId); const last=h.length?h[h.length-1]:null;
    $(k+'-iterations').innerHTML=`${r? r.iterations:'—'} <small>iterations</small>`;
    $(k+'-evals').textContent=r?String(r.functionEvaluations??'—'):'—';
    $(k+'-root').textContent=r&&Number.isFinite(r.root)?plain(r.root):'—';
    $(k+'-residual').textContent=r&&Number.isFinite(r.residual)?fmt(Math.abs(r.residual)):'—';
    let err='—'; if(last){if(methodId===1){const row=r.rows[r.rows.length-1];err=fmt(row[5])}else if(h.length>1)err=fmt(Math.abs(h[h.length-1].x-h[h.length-2].x))}
    $(k+'-error').textContent=err;
    const order=estimateOrder(h,r&&Number.isFinite(r.root)?r.root:NaN); if(methodId!==1)$(k+'-order').textContent=order;
    $(k+'-time').textContent=r?`${r.elapsedMs.toFixed(2)} ms`:'—';
    const card=$(k+'-iterations').closest('.method-card'); card.classList.toggle('not-converged',!!r&&!r.converged); card.classList.toggle('winner',!!r&&r.converged);
    if(!r){$(k+'-root').textContent='No result';}
  }
  function renderTable(methodId){
    selectedTab=methodId; document.querySelectorAll('[data-method-tab]').forEach(b=>b.classList.toggle('active',Number(b.dataset.methodTab)===methodId));
    const r=results[methodId], thead=table.querySelector('thead'), tbody=table.querySelector('tbody'); thead.replaceChildren();tbody.replaceChildren();
    if(!r||!r.columns||!r.rows||!r.rows.length){$('table-status').textContent=r?(r.message||'No iteration rows were needed.'): 'No iteration history for this method yet.';$('table-status').classList.remove('hidden');$('table-scroll').classList.add('hidden');$('download-csv').disabled=true;return}
    const tr=document.createElement('tr');r.columns.forEach(c=>{const th=document.createElement('th');th.textContent=c;tr.appendChild(th)});thead.appendChild(tr);
    r.rows.forEach(row=>{const tr=document.createElement('tr');row.forEach((v,i)=>{const td=document.createElement('td');td.textContent=i===0?String(v):plain(v);tr.appendChild(td)});tbody.appendChild(tr)});
    $('table-status').classList.add('hidden');$('table-scroll').classList.remove('hidden');$('download-csv').disabled=false;
  }
  function drawChart(canvas, series, mode){
    const dpr=window.devicePixelRatio||1, rect=canvas.getBoundingClientRect(), w=Math.max(320,rect.width), h=250;
    canvas.width=w*dpr;canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
    const pad={l:48,r:16,t:16,b:31}, pw=w-pad.l-pad.r, ph=h-pad.t-pad.b;
    let vals=series.flatMap(s=>s.points.map(p=>mode==='log'?Math.log10(Math.max(p.residual,1e-16)):p.x)).filter(Number.isFinite);
    if(!vals.length){ctx.fillStyle='#7d8b9c';ctx.font='12px sans-serif';ctx.fillText('Solve an equation to display comparison charts.',18,118);return}
    let min=Math.min(...vals),max=Math.max(...vals);if(max-min<1e-9){min-=1;max+=1} if(mode==='log'){min=Math.max(-16,Math.floor(min));max=Math.min(2,Math.ceil(max));if(max-min<2)max=min+2}
    const xx=i=>pad.l+(i/Math.max(1,Math.max(...series.map(s=>s.points.length-1),1)))*pw;
    const yy=v=>pad.t+(max-v)/(max-min)*ph;
    ctx.strokeStyle='#283442';ctx.lineWidth=1;ctx.fillStyle='#8593a5';ctx.font='10px monospace';
    for(let i=0;i<=4;i++){const v=min+(max-min)*i/4,y=yy(v);ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText(mode==='log'?`1e${Math.round(v)}`:v.toPrecision(3),4,y+3)}
    for(let i=0;i<=5;i++){const x=pad.l+pw*i/5;ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,h-pad.b);ctx.stroke();ctx.fillText(String(Math.round(Math.max(...series.map(s=>s.points.length-1),1)*i/5)),x-4,h-10)}
    if(mode==='log'){const t=Math.log10(Math.max(lastTolerance,1e-16));if(t>=min&&t<=max){ctx.strokeStyle='#ff6b78';ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(pad.l,yy(t));ctx.lineTo(w-pad.r,yy(t));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#ff8a95';ctx.fillText('tolerance',w-pad.r-60,yy(t)-5)}}
    series.forEach(s=>{if(!s.points.length)return;ctx.strokeStyle=s.color;ctx.lineWidth=2;ctx.setLineDash(s.id===1?[5,4]:s.id===3?[2,3]:[]);ctx.beginPath();s.points.forEach((p,i)=>{const val=mode==='log'?Math.log10(Math.max(p.residual,1e-16)):p.x;const x=xx(i),y=yy(val);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();ctx.setLineDash([]);s.points.forEach((p,i)=>{const val=mode==='log'?Math.log10(Math.max(p.residual,1e-16)):p.x;ctx.fillStyle=s.color;ctx.beginPath();ctx.arc(xx(i),yy(val),2.5,0,Math.PI*2);ctx.fill()})});
    ctx.fillStyle='#8794a6';ctx.font='10px monospace';ctx.fillText(mode==='log'?'iteration':'iteration',w/2-25,h-1);
  }
  function drawCharts(){
    const visibleIds=mode==='compare'?[1,2,3]:[singleMethodId];const series=visibleIds.map(id=>({id,color:colors[id],points:history(results[id],id)}));
    drawChart($('trajectory-chart'),series,'linear');drawChart($('convergence-chart'),series,'log');
    const successful=Object.entries(results).filter(([,r])=>r&&r.converged).sort((a,b)=>a[1].iterations-b[1].iterations);
    $('takeaway').classList.toggle('hidden',!Object.keys(results).length);
    if(successful.length){const [id,r]=successful[0];$('takeaway-text').textContent=`${names[id]} reached the tolerance in ${r.iterations} iteration(s). Compare function evaluations and residuals as well: fewer iterations do not always mean lower total computational cost.`}
    else $('takeaway-text').textContent='None of the methods reported convergence with these settings. Try a different bracket or starting guess, or increase the iteration limit.';
    $('trajectory-subtitle').textContent=`${lastExpr} = 0 · estimates across iterations`;
  }
  function updateMethodLabels(){const expr=equation.value.trim();$('parse-note').textContent=expr?`Enter an expression in x, for example cos(x)-x. Current: f(x) = ${expr}`:'Enter an expression in x, for example cos(x)-x.'}
  function updateMode(){
    const compare=mode==='compare';
    methodPicker.classList.toggle('hidden',compare);
    $('mode-single').classList.toggle('active',!compare); $('mode-compare').classList.toggle('active',compare);
    $('solve-button').innerHTML=compare?'Compare all three methods <span>↗</span>':`Calculate ${names[singleMethodId]} root <span>↗</span>`;
    document.querySelectorAll('[data-pick-method]').forEach(b=>b.classList.toggle('active',Number(b.dataset.pickMethod)===singleMethodId));
    document.querySelectorAll('.method-input').forEach(el=>{const id=Number(el.dataset.forMethod);el.classList.toggle('hidden',!compare&&id!==singleMethodId);el.classList.remove('full-width');});
    document.querySelector('.chart-grid').classList.remove('hidden');
    document.querySelectorAll('.method-card').forEach(card=>{const id=card.classList.contains('bis-card')?1:card.classList.contains('newton-card')?2:3;card.classList.toggle('hidden',!compare&&id!==singleMethodId)});
    document.querySelectorAll('[data-method-tab]').forEach(b=>b.classList.toggle('hidden',!compare&&Number(b.dataset.methodTab)!==singleMethodId));
    if(!compare)renderTable(singleMethodId);
    if(Object.keys(results).length)drawCharts();
  }
  equation.addEventListener('input',updateMethodLabels);
  decimalPlacesInput.addEventListener('change',()=>{
    [1,2,3].forEach(id=>renderCard(id,results[id],id));
    if(results[selectedTab]) renderTable(selectedTab);
  });
  $('mode-single').addEventListener('click',()=>{mode='single';updateMode()});
  $('mode-compare').addEventListener('click',()=>{mode='compare';updateMode()});
  document.querySelectorAll('[data-pick-method]').forEach(b=>b.addEventListener('click',()=>{singleMethodId=Number(b.dataset.pickMethod);updateMode()}));
  document.querySelectorAll('[data-expression]').forEach(b=>b.addEventListener('click',()=>{equation.value=b.dataset.expression;if(b.dataset.expression==='cos(x)-x'||b.dataset.expression==='x*exp(x)-1'){bracketA.value='0';bracketB.value='1';aInput.value='0.5';$('param-a-secant').value='0.5';bInput.value='1'}else if(b.dataset.expression==='log(x)+x^2-3'){bracketA.value='1';bracketB.value='2';aInput.value='1.5';$('param-a-secant').value='1.5';bInput.value='2'}else if(b.dataset.expression==='(x-1)^2*(x+2)'){bracketA.value='0';bracketB.value='2';aInput.value='0.5';$('param-a-secant').value='0.5';bInput.value='2'}updateMethodLabels();equation.focus()}));
  document.querySelectorAll('[data-method-tab]').forEach(b=>b.addEventListener('click',()=>renderTable(Number(b.dataset.methodTab))));
  solveButton.addEventListener('click',async()=>{
    setError('');const expr=equation.value.trim(),a=Number(aInput.value),aSecant=Number($('param-a-secant').value),b=Number(bInput.value),tol=Number(tolInput.value),max=Number(maxInput.value),ba=Number(bracketA.value),bb=Number(bracketB.value);
    if(!expr)return setError('Enter an expression f(x) = 0.');
    if(!(tol>0&&Number.isFinite(tol)))return setError('Tolerance must be a positive decimal, for example 0.001 or 0.000001.');
    if(!Number.isInteger(max)||max<1||max>10000)return setError('Maximum iterations must be an integer from 1 to 10,000.');
    const compare=mode==='compare', methodIds=compare?[1,2,3]:[singleMethodId];
    if(methodIds.includes(1)&&(!Number.isFinite(ba)||!Number.isFinite(bb)||!(ba<bb)))return setError('For Bisection, enter finite bounds with lower bound less than upper bound.');
    if(methodIds.includes(2)&&!Number.isFinite(a))return setError('Enter a finite initial guess for Newton–Raphson.');
    if(methodIds.includes(3)&&(!Number.isFinite(aSecant)||!Number.isFinite(b)||aSecant===b))return setError('For Secant, enter two different finite starting guesses.');
    solveButton.disabled=true;solveButton.innerHTML=compare?'Comparing methods…':'Calculating root…';
    try{
      const m=await ensureWasm();lastExpr=expr;lastTolerance=tol;results={};
      for(const id of methodIds){try{const startA=id===1?ba:(id===2?a:aSecant),startB=id===1?bb:b;results[id]=await solveMethod(m,id,expr,startA,startB,tol,max);if(!results[id].ok)results[id].error=results[id].message;}catch(e){results[id]={ok:false,converged:false,status:'error',message:e.message,iterations:0,rows:[],columns:[]}}}
      [1,2,3].forEach(id=>renderCard(id,results[id],id));
      const failures=Object.entries(results).filter(([,r])=>!r.ok).map(([id,r])=>`${names[id]}: ${r.message}`);
      if(failures.length)setError(failures.join(' · '));
      if(compare){drawCharts();$('takeaway').classList.remove('hidden');}else{drawCharts();$('takeaway').classList.add('hidden');}
      renderTable(compare?selectedTab:methodIds[0]);if(!compare)selectedTab=methodIds[0];updateMode();
    }catch(e){setError(e.message||'Unable to load the WebAssembly solver.');}
    finally{solveButton.disabled=false;updateMode()}
  });
  $('download-csv').addEventListener('click',()=>{const r=results[selectedTab];if(!r||!r.rows)return;const esc=v=>{const s=String(v??'');return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};const lines=[r.columns.map(esc).join(','),...r.rows.map(row=>row.map(esc).join(','))];const blob=new Blob([lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${keys[selectedTab]}-iterations.csv`;a.click();URL.revokeObjectURL(url)});
  window.addEventListener('resize',()=>{if(Object.keys(results).length)drawCharts()});updateMethodLabels();updateMode();drawCharts();
})();
