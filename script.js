/* ================================================================
   DSA Practice Sheet Pro — script.js
   Features: Parser · Streak · Heatmap · Calendar · Schedule
             Bookmarks · Revision · Notes · Timer · Charts · Export
   ================================================================ */

// ── Storage Keys ───────────────────────────────────────────────────
const KEY_SOLVED    = 'dsa_solved_v3';
const KEY_THEME     = 'dsa_theme';
const KEY_BOOKMARKS = 'dsa_bookmarks';
const KEY_REVISION  = 'dsa_revision';
const KEY_NOTES     = 'dsa_notes';
const KEY_TIMES     = 'dsa_times';
const KEY_ACTIVITY  = 'dsa_activity';
const KEY_SCHEDULE  = 'dsa_schedule';

// ── Category Icons ─────────────────────────────────────────────────
const CAT_ICONS = {
  'Greedy Algorithms':'💡','Binary Search':'🔍','Sliding Window':'🪟',
  'String Manipulation Mastery':'🧵','Bit Manipulation Mastery':'🔢',
  'Recursion and Backtracking Mastery':'🔄','Heap Priority Queue Mastery':'🏔️',
  'Arrays':'📦','Linked List':'🔗','Trees':'🌲',
  'Dynamic Programming':'🧮','Graphs':'🕸️','Stack & Queue':'📚',
};

// ── State ──────────────────────────────────────────────────────────
let allProblems  = [];
let solvedSet    = new Set();
let bookmarkSet  = new Set();
let revisionSet  = new Set();
let notesMap     = {};   // id → string
let timesMap     = {};   // id → seconds
let activityMap  = {};   // 'YYYY-MM-DD' → [problemId, ...]
let scheduleData = {};   // 'YYYY-MM-DD' → [problemId, ...]

let activeFilter = 'all';
let activeChip   = 'all';
let searchQuery  = '';
let currentView  = 'sheet';
let calDate      = new Date();

// Timer state
let timerInterval = null;
let timerSeconds  = 0;
let timerProbId   = null;
let timerRunning  = false;

// Note modal state
let noteCurrentId = null;

// ── Boot ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  loadTheme();
  wireUI();
  fetchAndRender();
});

function loadAll() {
  solvedSet    = loadSet(KEY_SOLVED);
  bookmarkSet  = loadSet(KEY_BOOKMARKS);
  revisionSet  = loadSet(KEY_REVISION);
  notesMap     = loadObj(KEY_NOTES);
  timesMap     = loadObj(KEY_TIMES);
  activityMap  = loadObj(KEY_ACTIVITY);
  scheduleData = loadObj(KEY_SCHEDULE);
}

function wireUI() {
  // Nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  // Theme
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  // Search
  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value.trim().toLowerCase();
    applyFilters();
  });
  // Difficulty filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      applyFilters();
    });
  });
  // Chip bar
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeChip = chip.dataset.chip;
      applyFilters();
    });
  });
  // Export
  document.getElementById('exportBtn').addEventListener('click', exportCSV);
  // Calendar nav
  document.getElementById('calPrev').addEventListener('click', () => { calDate.setMonth(calDate.getMonth()-1); renderCalendar(); });
  document.getElementById('calNext').addEventListener('click', () => { calDate.setMonth(calDate.getMonth()+1); renderCalendar(); });
  document.getElementById('dayPanelClose').addEventListener('click', () => { document.getElementById('dayPanel').style.display='none'; });
  // Schedule
  document.getElementById('generateSchedule').addEventListener('click', generateSchedule);
  document.getElementById('clearSchedule').addEventListener('click', clearSchedule);
  // Set default schedule date to today
  document.getElementById('schedStart').value = todayStr();
  // Note modal
  document.getElementById('noteModalClose').addEventListener('click',  closeNoteModal);
  document.getElementById('noteModalClose2').addEventListener('click', closeNoteModal);
  document.getElementById('noteSave').addEventListener('click', saveNote);
  // Timer modal
  document.getElementById('timerClose').addEventListener('click', closeTimer);
  document.getElementById('timerStartStop').addEventListener('click', timerToggle);
  document.getElementById('timerReset').addEventListener('click', timerReset);
}

// ── View switching ─────────────────────────────────────────────────
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  document.querySelector('[data-view="'+view+'"]').classList.add('active');
  if (view === 'dashboard') renderDashboard();
  if (view === 'calendar')  renderCalendar();
  if (view === 'schedule')  renderScheduleOutput();
}

// ── Fetch & Parse ──────────────────────────────────────────────────
async function fetchAndRender() {
  try {
    const res = await fetch('questions.md');
    if (!res.ok) throw new Error('HTTP '+res.status);
    allProblems = parseMarkdown(await res.text());
    applyFilters();
    updateStats();
    renderDiffRings();
    document.getElementById('loading').style.display  = 'none';
    document.getElementById('content').style.display  = 'block';
  } catch(err) {
    document.getElementById('loading').innerHTML =
      '<div style="text-align:center;padding:60px;color:var(--text-muted)">⚠️ Could not load <code>questions.md</code>.<br>Run a local server (e.g. VS Code Live Server).</div>';
    console.error(err);
  }
}

// ── Markdown Parser ────────────────────────────────────────────────
function parseMarkdown(md) {
  const problems = [];
  const lines = md.split('\n');
  let category = 'General', columnMap = null, gIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const hm = line.match(/^#{1,3}\s+(.+)/);
    if (hm) { category = cleanHeading(hm[1]); columnMap = null; continue; }
    if (/^\|[\s\-:|]+\|/.test(line)) continue;
    if (!line.startsWith('|')) continue;
    const cells = splitRow(line);
    if (cells.length < 2) continue;
    if (isHeader(cells)) { columnMap = buildColMap(cells); continue; }
    if (!columnMap) { columnMap = inferColMap(cells); if (!columnMap) continue; }

    const diffIdx = columnMap.difficulty >= 0 ? columnMap.difficulty : -1;
    const diff = diffIdx >= 0 ? parseDiff(cells[diffIdx]) : scanDiff(cells);
    if (!diff) continue;

    const nameIdx = columnMap.name >= 0 ? columnMap.name : -1;
    const name = stripLinks(nameIdx >= 0 ? (cells[nameIdx]||'') : '').replace(/\*\*/g,'').trim();
    if (!name) continue;

    const links = []; const seen = new Set();
    cells.forEach(c => extractLinks(c).forEach(l => { if (!seen.has(l.url)) { seen.add(l.url); links.push(l); } }));

    const ci = columnMap.companies >= 0 ? columnMap.companies : -1;
    const companies = ci >= 0 ? parseCompanies(cells[ci]||'') : [];
    const xi = columnMap.concept >= 0 ? columnMap.concept : -1;
    const concept = xi >= 0 ? stripLinks(cells[xi]||'').replace(/\*\*/g,'').trim() : '';
    const di = columnMap.day >= 0 ? columnMap.day : -1;
    const day = di >= 0 ? (cells[di]||'').replace(/\*\*/g,'').trim() : '';

    gIdx++;
    problems.push({ id: category+'__'+gIdx, num: gIdx, day, category, difficulty: diff, name, concept, links, companies });
  }
  return problems;
}

function parseDiff(raw) {
  if (!raw) return null;
  for (const ch of raw) {
    const cp = ch.codePointAt(0);
    if (cp===0x1F7E2) return 'Easy';
    if (cp===0x1F7E1) return 'Medium';
    if (cp===0x1F534) return 'Hard';
  }
  const s = raw.toLowerCase().trim();
  if (s==='easy') return 'Easy'; if (s==='medium') return 'Medium'; if (s==='hard') return 'Hard';
  return null;
}
function scanDiff(cells) { for (const c of cells) { const d=parseDiff(c); if (d) return d; } return null; }

function isHeader(cells) {
  const s = cells.map(c => stripLinks(c).toLowerCase().trim());
  return s.some(c=>c==='difficulty'||c==='diff') ||
         s.some(c=>c==='problem name'||c==='name') ||
         (s.some(c=>c==='day') && s.some(c=>c==='problem name'||c==='name'));
}
function buildColMap(cells) {
  const m = {difficulty:-1,name:-1,companies:-1,concept:-1,day:-1,linkCols:[]};
  cells.forEach((raw,idx) => {
    const c = stripLinks(raw).toLowerCase().replace(/[^a-z0-9 ]/g,'').trim();
    if (c==='difficulty'||c==='diff') { if(m.difficulty<0) m.difficulty=idx; }
    else if (c==='problem name'||c==='name'||c==='problem') { if(m.name<0) m.name=idx; }
    else if (c.includes('compan')) { if(m.companies<0) m.companies=idx; }
    else if (c==='main concept'||c==='concept'||c==='topic') { if(m.concept<0) m.concept=idx; }
    else if (c==='day') { if(m.day<0) m.day=idx; }
    else if (c.includes('link')||c==='leetcode'||c==='gfg'||c==='practice link') m.linkCols.push(idx);
  });
  return m;
}
function inferColMap(cells) {
  for (let i=0;i<cells.length;i++) {
    if (parseDiff(cells[i])) return {difficulty:i,name:i+1<cells.length?i+1:-1,companies:-1,concept:-1,day:-1,linkCols:i+2<cells.length?[i+2]:[]};
  }
  return null;
}
function splitRow(line) {
  const inner = line.replace(/^\||\|$/g,'');
  const cells=[]; let cur='',depth=0;
  for (let i=0;i<inner.length;i++) {
    const ch=inner[i];
    if(ch==='['){depth++;cur+=ch;} else if(ch===']'){depth=Math.max(0,depth-1);cur+=ch;}
    else if(ch==='|'&&!depth){cells.push(cur.trim());cur='';}
    else cur+=ch;
  }
  cells.push(cur.trim()); return cells;
}
function extractLinks(cell) {
  const out=[]; if(!cell||cell.trim()==='N/A') return out;
  const re=/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g; let m;
  while((m=re.exec(cell))!==null){
    const url=m[2].trim();
    let label=m[1].trim();
    if(/leetcode\.com/i.test(url)) label='LeetCode';
    else if(/geeksforgeeks\.org/i.test(url)) label='GFG';
    else label=label.replace(/^(leetcode|gfg|link)\s*/i,'').trim()||'Link';
    out.push({label,url});
  }
  return out;
}
function stripLinks(s){ return (s||'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').trim(); }
function parseCompanies(raw){ if(!raw||raw.trim()===''||raw.trim()==='N/A') return []; return stripLinks(raw).split(',').map(c=>c.trim()).filter(Boolean); }
function cleanHeading(h){
  let start=0;
  for(let i=0;i<h.length;){const cp=h.codePointAt(i);if(cp>0x2000){i+=cp>0xFFFF?2:1;start=i;}else break;}
  return h.slice(start).replace(/:\s*.*/,'').trim();
}

// ── Filter & Render ────────────────────────────────────────────────
function applyFilters() {
  let list = allProblems;
  if (activeFilter!=='all') list = list.filter(p=>p.difficulty.toLowerCase()===activeFilter);
  if (searchQuery) list = list.filter(p=>
    p.name.toLowerCase().includes(searchQuery)||
    p.category.toLowerCase().includes(searchQuery)||
    p.concept.toLowerCase().includes(searchQuery)||
    p.companies.some(c=>c.toLowerCase().includes(searchQuery))
  );
  if (activeChip==='bookmarked') list = list.filter(p=>bookmarkSet.has(p.id));
  if (activeChip==='revision')   list = list.filter(p=>revisionSet.has(p.id));
  if (activeChip==='unsolved')   list = list.filter(p=>!solvedSet.has(p.id));
  if (activeChip==='solved')     list = list.filter(p=>solvedSet.has(p.id));
  render(list);
  updateStats();
  renderDiffRings();
}

function render(problems) {
  const container = document.getElementById('categories');
  container.innerHTML = '';
  if (!problems.length) { container.innerHTML='<div style="text-align:center;padding:60px;color:var(--text-muted)">🔭 No problems match your filters.</div>'; return; }
  const grouped={};
  problems.forEach(p=>{ if(!grouped[p.category]) grouped[p.category]=[]; grouped[p.category].push(p); });
  Object.entries(grouped).forEach(([cat,probs],idx)=>container.appendChild(buildSection(cat,probs,idx)));
}

function buildSection(category, problems, idx) {
  const section = document.createElement('div');
  section.className = 'category-section';
  section.style.animationDelay=(idx*0.04)+'s';
  const icon = getCatIcon(category);
  const solved = problems.filter(p=>solvedSet.has(p.id)).length;
  const hasConcept = problems.some(p=>p.concept);
  const hasDay     = problems.some(p=>p.day);

  section.innerHTML =
    '<div class="category-header" data-cat="'+esc(category)+'">' +
      '<div class="category-icon">'+icon+'</div>' +
      '<div class="category-title">'+esc(category)+'</div>' +
      '<div class="category-count">'+solved+'/'+problems.length+'</div>' +
      '<div class="category-toggle">▼</div>' +
    '</div>' +
    '<div class="category-body"><div class="table-wrap"><table>' +
      '<thead><tr>' +
        '<th>Done</th>' +
        (hasDay?'<th class="col-day">Day</th>':'')+
        '<th>Diff</th><th>Problem</th>' +
        (hasConcept?'<th class="col-concept">Concept</th>':'')+
        '<th>Links</th><th class="col-companies">Companies</th>' +
        '<th>Actions</th>' +
      '</tr></thead>' +
      '<tbody>'+problems.map(p=>buildRow(p,hasDay,hasConcept)).join('')+'</tbody>' +
    '</table></div></div>';

  // Collapse
  section.querySelector('.category-header').addEventListener('click', ()=>{
    const body = section.querySelector('.category-body');
    if (section.classList.contains('collapsed')) {
      section.classList.remove('collapsed'); body.style.maxHeight=body.scrollHeight+'px';
    } else {
      body.style.maxHeight=body.scrollHeight+'px';
      requestAnimationFrame(()=>{ section.classList.add('collapsed'); body.style.maxHeight='0'; });
    }
  });
  requestAnimationFrame(()=>{ section.querySelector('.category-body').style.maxHeight=section.querySelector('.category-body').scrollHeight+'px'; });

  // Checkbox
  section.querySelectorAll('.custom-checkbox').forEach(cb=>{
    cb.addEventListener('click', e=>{ e.stopPropagation(); toggleSolved(cb.dataset.id, section, cb); });
  });
  // Action buttons
  section.querySelectorAll('.btn-bookmark').forEach(btn=>{
    btn.addEventListener('click', e=>{ e.stopPropagation(); toggleBookmark(btn.dataset.id, btn); });
  });
  section.querySelectorAll('.btn-revision').forEach(btn=>{
    btn.addEventListener('click', e=>{ e.stopPropagation(); toggleRevision(btn.dataset.id, btn); });
  });
  section.querySelectorAll('.btn-note').forEach(btn=>{
    btn.addEventListener('click', e=>{ e.stopPropagation(); openNoteModal(btn.dataset.id, btn.dataset.name); });
  });
  section.querySelectorAll('.btn-timer').forEach(btn=>{
    btn.addEventListener('click', e=>{ e.stopPropagation(); openTimer(btn.dataset.id, btn.dataset.name); });
  });
  return section;
}

function buildRow(p, hasDay, hasConcept) {
  const checked   = solvedSet.has(p.id);
  const bookmarked= bookmarkSet.has(p.id);
  const revision  = revisionSet.has(p.id);
  const hasNote   = !!(notesMap[p.id]&&notesMap[p.id].trim());
  const timeStr   = timesMap[p.id] ? fmtTime(timesMap[p.id]) : '';

  const linksHtml = p.links.length
    ? p.links.map(l=>'<a class="link-chip '+l.label.toLowerCase()+'" href="'+esc(l.url)+'" target="_blank" rel="noopener">'+esc(l.label)+' <span class="ext-icon">↗</span></a>').join('')
    : '<span class="na-text">—</span>';

  const companiesHtml = p.companies.map(c=>'<span class="company-tag">'+esc(c)+'</span>').join('');

  return '<tr class="'+(checked?'solved-row ':'')+( revision?'revision-row':'')+'" data-id="'+esc(p.id)+'">' +
    '<td><div class="checkbox-wrap"><div class="custom-checkbox '+(checked?'checked':'')+'" data-id="'+esc(p.id)+'"></div></div></td>' +
    (hasDay?'<td class="col-day">'+esc(p.day)+'</td>':'')+
    '<td><span class="badge '+p.difficulty.toLowerCase()+'">'+p.difficulty+'</span></td>'+
    '<td class="col-name"><span class="problem-name">'+esc(p.name)+'</span>'+(timeStr?'<br><span class="time-badge">⏱ '+timeStr+'</span>':'')+'</td>'+
    (hasConcept?'<td class="col-concept"><span class="concept-tag">'+esc(p.concept)+'</span></td>':'')+
    '<td class="col-links"><div class="links-wrap">'+linksHtml+'</div></td>'+
    '<td class="col-companies"><div class="companies">'+companiesHtml+'</div></td>'+
    '<td><div class="row-actions">' +
      '<button class="action-btn btn-bookmark'+(bookmarked?' bookmarked':'')+'" data-id="'+esc(p.id)+'" title="Bookmark">🔖</button>' +
      '<button class="action-btn btn-revision'+(revision?' revision-on':'')+'" data-id="'+esc(p.id)+'" title="Mark for revision">🔁</button>' +
      '<button class="action-btn btn-note'+(hasNote?' has-note':'')+'" data-id="'+esc(p.id)+'" data-name="'+esc(p.name)+'" title="Notes">📝</button>' +
      '<button class="action-btn btn-timer" data-id="'+esc(p.id)+'" data-name="'+esc(p.name)+'" title="Timer">⏱️</button>' +
    '</div></td>' +
    '</tr>';
}

// ── Toggle actions ─────────────────────────────────────────────────
function toggleSolved(id, section, cbEl) {
  if (solvedSet.has(id)) solvedSet.delete(id); else { solvedSet.add(id); recordActivity(id); }
  saveSet(KEY_SOLVED, solvedSet);
  cbEl.classList.toggle('checked', solvedSet.has(id));
  const row = section.querySelector('tr[data-id="'+id+'"]');
  if (row) row.classList.toggle('solved-row', solvedSet.has(id));
  const cat = section.querySelector('.category-header').dataset.cat;
  const catProbs = allProblems.filter(p=>p.category===cat);
  section.querySelector('.category-count').textContent = catProbs.filter(p=>solvedSet.has(p.id)).length+'/'+catProbs.length;
  updateStats(); renderDiffRings();
}

function toggleBookmark(id, btn) {
  if (bookmarkSet.has(id)) bookmarkSet.delete(id); else bookmarkSet.add(id);
  saveSet(KEY_BOOKMARKS, bookmarkSet);
  btn.classList.toggle('bookmarked', bookmarkSet.has(id));
  updateStats();
}

function toggleRevision(id, btn) {
  if (revisionSet.has(id)) revisionSet.delete(id); else revisionSet.add(id);
  saveSet(KEY_REVISION, revisionSet);
  btn.classList.toggle('revision-on', revisionSet.has(id));
  const row = btn.closest('tr');
  if (row) row.classList.toggle('revision-row', revisionSet.has(id));
}

function recordActivity(id) {
  const d = todayStr();
  if (!activityMap[d]) activityMap[d] = [];
  if (!activityMap[d].includes(id)) activityMap[d].push(id);
  saveObj(KEY_ACTIVITY, activityMap);
  updateStreak();
}

// ── Stats ──────────────────────────────────────────────────────────
function updateStats() {
  const total  = allProblems.length;
  const solved = allProblems.filter(p=>solvedSet.has(p.id)).length;
  const pct    = total ? Math.round(solved/total*100) : 0;
  const _t=el('statTotal'); if(_t) _t.textContent=total;
  const _s=el('statSolved'); if(_s) _s.textContent=solved;
  const _p=el('statPct'); if(_p) _p.textContent=pct+'%';
  const _b=el('statBookmarks'); if(_b) _b.textContent=bookmarkSet.size;
  const _pf=el('progressFill'); if(_pf) _pf.style.width=pct+'%';
  const _pp=el('progressPct'); if(_pp) _pp.textContent=pct+'%';
  updateStreak();
}

function updateStreak() {
  let streak=0, d=new Date();
  while(true){
    const s=dateStr(d);
    if (activityMap[s]&&activityMap[s].length>0) { streak++; d.setDate(d.getDate()-1); }
    else break;
  }
  const _ss=el('statStreak'); if(_ss) _ss.textContent=streak;
}

// ── Difficulty Rings ───────────────────────────────────────────────
function renderDiffRings() {
  const diffs = ['Easy','Medium','Hard'];
  const colors = { Easy:'var(--easy)', Medium:'var(--medium)', Hard:'var(--hard)' };
  const container = el('diffRings');
  if(!container) return;
  container.innerHTML = '';
  diffs.forEach(d => {
    const total  = allProblems.filter(p=>p.difficulty===d).length;
    const solved = allProblems.filter(p=>p.difficulty===d&&solvedSet.has(p.id)).length;
    const pct    = total ? solved/total : 0;
    const r=18, circ=2*Math.PI*r, offset=circ*(1-pct);
    const div = document.createElement('div');
    div.className = 'diff-ring-item';
    div.innerHTML =
      '<svg class="diff-ring-svg" width="44" height="44" viewBox="0 0 44 44">' +
        '<circle cx="22" cy="22" r="'+r+'" stroke="var(--progress-bg)" stroke-width="4"/>' +
        '<circle cx="22" cy="22" r="'+r+'" stroke="'+colors[d]+'" stroke-width="4" stroke-linecap="round"' +
          ' stroke-dasharray="'+circ+'" stroke-dashoffset="'+offset+'"/>' +
      '</svg>' +
      '<div class="diff-ring-count">'+solved+'/'+total+'</div>' +
      '<div class="diff-ring-label">'+d+'</div>';
    container.appendChild(div);
  });
}

// ── Dashboard ──────────────────────────────────────────────────────
function renderDashboard() {
  renderTopicChart();
  renderRingChart();
  renderCompanyChart();
  renderHeatmap();
}

function renderTopicChart() {
  const container = el('topicChart');
  container.innerHTML = '';
  const cats = [...new Set(allProblems.map(p=>p.category))];
  cats.forEach(cat => {
    const total  = allProblems.filter(p=>p.category===cat).length;
    const solved = allProblems.filter(p=>p.category===cat&&solvedSet.has(p.id)).length;
    const pct    = total ? Math.round(solved/total*100) : 0;
    const row = document.createElement('div');
    row.className = 'topic-bar-row';
    row.innerHTML =
      '<div class="topic-bar-label">'+getCatIcon(cat)+' '+esc(cat)+'</div>' +
      '<div class="topic-bar-track"><div class="topic-bar-fill" style="width:'+pct+'%"></div></div>' +
      '<div class="topic-bar-stat">'+solved+'/'+total+'</div>';
    container.appendChild(row);
  });
}

function renderRingChart() {
  const container = el('ringChart');
  container.innerHTML = '';
  [['Easy','var(--easy)'],['Medium','var(--medium)'],['Hard','var(--hard)']].forEach(([d,color])=>{
    const total  = allProblems.filter(p=>p.difficulty===d).length;
    const solved = allProblems.filter(p=>p.difficulty===d&&solvedSet.has(p.id)).length;
    const pct    = total ? solved/total : 0;
    const r=36, circ=2*Math.PI*r, offset=circ*(1-pct);
    const div = document.createElement('div');
    div.className = 'ring-item';
    div.innerHTML =
      '<svg style="transform:rotate(-90deg)" width="88" height="88" viewBox="0 0 88 88">' +
        '<circle cx="44" cy="44" r="'+r+'" fill="none" stroke="var(--progress-bg)" stroke-width="6"/>' +
        '<circle cx="44" cy="44" r="'+r+'" fill="none" stroke="'+color+'" stroke-width="6" stroke-linecap="round"' +
          ' stroke-dasharray="'+circ+'" stroke-dashoffset="'+offset+'"/>' +
        '<text x="44" y="44" text-anchor="middle" dominant-baseline="central" fill="var(--text-primary)"' +
          ' font-family="Syne,sans-serif" font-size="13" font-weight="700" transform="rotate(90,44,44)">'+Math.round(pct*100)+'%</text>' +
      '</svg>' +
      '<div class="ring-label '+d.toLowerCase()+'">'+d+'</div>' +
      '<div class="ring-sub">'+solved+'/'+total+'</div>';
    container.appendChild(div);
  });
}

function renderCompanyChart() {
  const container = el('companyChart');
  container.innerHTML = '';
  const compCount = {};
  allProblems.forEach(p=>p.companies.forEach(c=>{ compCount[c]=(compCount[c]||0)+1; }));
  const sorted = Object.entries(compCount).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const max = sorted[0]?.[1]||1;
  sorted.forEach(([name,count])=>{
    const row = document.createElement('div');
    row.className = 'company-bar-row';
    row.innerHTML =
      '<div class="company-bar-name">'+esc(name)+'</div>' +
      '<div class="company-bar-track"><div class="company-bar-fill" style="width:'+Math.round(count/max*100)+'%"></div></div>' +
      '<div class="company-bar-count">'+count+'</div>';
    container.appendChild(row);
  });
}

function renderHeatmap() {
  const container = el('heatmap');
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'heatmap-scroll';
  const inner = document.createElement('div');
  inner.style.display = 'flex';
  inner.style.gap = '4px';
  inner.style.alignItems = 'flex-end';

  // Day labels
  const dayLabels = document.createElement('div');
  dayLabels.className = 'heatmap-day-labels';
  ['','M','','W','','F',''].forEach(l=>{ const s=document.createElement('div'); s.className='heatmap-day-label'; s.textContent=l; dayLabels.appendChild(s); });
  inner.appendChild(dayLabels);

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 180);
  // Align to Sunday
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const cols = document.createElement('div');
  cols.style.display='flex'; cols.style.gap='3px';

  let d = new Date(startDate);
  while (d <= today) {
    const col = document.createElement('div');
    col.className = 'heatmap-col';
    for (let day=0;day<7;day++) {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      const ds = dateStr(d);
      const count = activityMap[ds] ? activityMap[ds].length : 0;
      cell.classList.add(count===0?'l0':count<=1?'l1':count<=3?'l2':count<=5?'l3':'l4');
      cell.title = ds+': '+count+' solved';
      col.appendChild(cell);
      d.setDate(d.getDate()+1);
    }
    cols.appendChild(col);
  }
  inner.appendChild(cols);
  wrap.appendChild(inner);
  container.appendChild(wrap);
}

// ── Calendar ───────────────────────────────────────────────────────
function renderCalendar() {
  const grid = el('calGrid');
  const title = el('calTitle');
  grid.innerHTML = '';

  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  title.textContent = new Date(year,month,1).toLocaleDateString('en',{month:'long',year:'numeric'});

  // Day names
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d=>{
    const dn = document.createElement('div');
    dn.className='cal-day-name'; dn.textContent=d;
    grid.appendChild(dn);
  });

  const firstDay = new Date(year,month,1).getDay();
  const daysInMonth = new Date(year,month+1,0).getDate();
  const today = new Date();

  // Empty cells before first day
  for (let i=0;i<firstDay;i++) {
    const prev = new Date(year,month,0-firstDay+i+1);
    const cell = calCell(prev, true);
    grid.appendChild(cell);
  }
  for (let d=1;d<=daysInMonth;d++) {
    const date = new Date(year,month,d);
    const cell = calCell(date, false);
    if (date.toDateString()===today.toDateString()) cell.classList.add('today');
    grid.appendChild(cell);
  }
  // Trailing cells
  const total = firstDay + daysInMonth;
  const trailing = total%7===0?0:7-total%7;
  for (let i=1;i<=trailing;i++) {
    const next = new Date(year,month+1,i);
    grid.appendChild(calCell(next, true));
  }
}

function calCell(date, otherMonth) {
  const cell = document.createElement('div');
  cell.className = 'cal-cell' + (otherMonth?' other-month':'');
  const ds = dateStr(date);
  const solvedToday = activityMap[ds]||[];
  const scheduledToday = scheduleData[ds]||[];
  const revisionDue = [...revisionSet].filter(id=>scheduledToday.includes(id));
  if (solvedToday.length||scheduledToday.length) cell.classList.add('has-activity');

  const dateEl = document.createElement('div');
  dateEl.className='cal-date'; dateEl.textContent=date.getDate();
  cell.appendChild(dateEl);

  const dots = document.createElement('div');
  dots.className='cal-dots';
  solvedToday.slice(0,5).forEach(()=>{ const d=document.createElement('div'); d.className='cal-dot solved'; dots.appendChild(d); });
  revisionDue.slice(0,3).forEach(()=>{ const d=document.createElement('div'); d.className='cal-dot revision'; dots.appendChild(d); });
  scheduledToday.filter(id=>!solvedSet.has(id)).slice(0,4).forEach(()=>{ const d=document.createElement('div'); d.className='cal-dot scheduled'; dots.appendChild(d); });
  cell.appendChild(dots);

  if (!otherMonth) {
    cell.addEventListener('click', ()=>showDayPanel(ds, date));
  }
  return cell;
}

function showDayPanel(ds, date) {
  const panel   = el('dayPanel');
  const title   = el('dayPanelTitle');
  const content = el('dayPanelContent');
  title.textContent = date.toLocaleDateString('en',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  content.innerHTML = '';
  panel.style.display = 'block';

  const solved    = (activityMap[ds]||[]);
  const scheduled = (scheduleData[ds]||[]);
  const allIds    = [...new Set([...solved,...scheduled])];

  if (!allIds.length) { content.innerHTML='<p style="color:var(--text-muted);padding:8px 0">No activity on this day.</p>'; return; }

  allIds.forEach(id => {
    const p = allProblems.find(x=>x.id===id);
    if (!p) return;
    const row = document.createElement('div');
    row.className = 'day-panel-item';
    const isSolved = solvedSet.has(id);
    const isSched  = scheduled.includes(id);
    row.innerHTML =
      '<span class="day-panel-badge" style="background:var(--'+(p.difficulty.toLowerCase())+'-bg);color:var(--'+(p.difficulty.toLowerCase())+')">'+p.difficulty+'</span>' +
      '<span style="flex:1;font-size:12px">'+esc(p.name)+'</span>' +
      (isSolved?'<span style="color:var(--easy);font-size:11px">✅ Solved</span>':'') +
      (isSched&&!isSolved?'<span style="color:var(--accent);font-size:11px">📅 Scheduled</span>':'');
    content.appendChild(row);
  });
}

// ── Schedule ───────────────────────────────────────────────────────
function generateSchedule() {
  const startVal = el('schedStart').value;
  const perDay   = parseInt(el('schedPerDay').value)||5;
  const priority = el('schedPriority').value;

  if (!startVal) { alert('Please select a start date.'); return; }

  let problems = allProblems.filter(p=>!solvedSet.has(p.id));

  if (priority==='easy-first')  problems.sort((a,b)=>diffOrder(a.difficulty)-diffOrder(b.difficulty));
  if (priority==='hard-first')  problems.sort((a,b)=>diffOrder(b.difficulty)-diffOrder(a.difficulty));
  if (priority==='revision')    problems.sort((a,b)=>revisionSet.has(b.id)?1:-1);

  scheduleData = {};
  let d = new Date(startVal+'T00:00:00');
  let i = 0;
  while (i < problems.length) {
    const ds = dateStr(d);
    scheduleData[ds] = problems.slice(i, i+perDay).map(p=>p.id);
    i += perDay;
    d.setDate(d.getDate()+1);
  }
  saveObj(KEY_SCHEDULE, scheduleData);
  renderScheduleOutput();
  el('scheduleSetup').style.display = 'none';
  el('scheduleOutput').style.display = 'block';
}

function clearSchedule() {
  scheduleData = {};
  saveObj(KEY_SCHEDULE, scheduleData);
  el('scheduleSetup').style.display = 'block';
  el('scheduleOutput').style.display = 'none';
}

function renderScheduleOutput() {
  const output = el('schedDays');
  if (!output) return;
  output.innerHTML = '';
  const days = Object.keys(scheduleData).sort();
  if (!days.length) { el('scheduleSetup').style.display='block'; el('scheduleOutput').style.display='none'; return; }
  el('scheduleSetup').style.display = 'none';
  el('scheduleOutput').style.display = 'block';

  const total = Object.values(scheduleData).reduce((s,a)=>s+a.length,0);
  el('schedSummary').textContent = days.length+' days · '+total+' problems scheduled';

  days.forEach(ds => {
    const ids = scheduleData[ds];
    const date = new Date(ds+'T00:00:00');
    const dateLabel = date.toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'});
    const solvedCount = ids.filter(id=>solvedSet.has(id)).length;

    const block = document.createElement('div');
    block.className = 'sched-day-block';
    block.innerHTML =
      '<div class="sched-day-header">' +
        '<div class="sched-day-title">📅 '+esc(dateLabel)+'</div>' +
        '<div class="sched-day-meta">'+solvedCount+'/'+ids.length+' done</div>' +
      '</div>';

    ids.forEach(id => {
      const p = allProblems.find(x=>x.id===id);
      if (!p) return;
      const row = document.createElement('div');
      row.className = 'sched-problem-row';
      const isSolved = solvedSet.has(id);
      row.innerHTML =
        '<span class="badge '+p.difficulty.toLowerCase()+'">'+p.difficulty+'</span>' +
        '<span class="sched-problem-name" style="'+(isSolved?'text-decoration:line-through;opacity:0.5':'')+'">'+esc(p.name)+'</span>' +
        (p.links[0]?'<a class="link-chip leetcode" href="'+esc(p.links[0].url)+'" target="_blank">'+esc(p.links[0].label)+' ↗</a>':'');
      block.appendChild(row);
    });
    output.appendChild(block);
  });
}

function diffOrder(d){ return d==='Easy'?0:d==='Medium'?1:2; }

// ── Note Modal ─────────────────────────────────────────────────────
function openNoteModal(id, name) {
  noteCurrentId = id;
  el('noteModalTitle').textContent = '📝 '+name;
  el('noteText').value = notesMap[id]||'';
  el('noteModal').style.display = 'flex';
  setTimeout(()=>el('noteText').focus(),100);
}
function closeNoteModal() { el('noteModal').style.display='none'; noteCurrentId=null; }
function saveNote() {
  if (!noteCurrentId) return;
  notesMap[noteCurrentId] = el('noteText').value;
  saveObj(KEY_NOTES, notesMap);
  // Update note button style
  const btn = document.querySelector('.btn-note[data-id="'+noteCurrentId+'"]');
  if (btn) btn.classList.toggle('has-note', !!(notesMap[noteCurrentId]&&notesMap[noteCurrentId].trim()));
  closeNoteModal();
}

// ── Timer Modal ────────────────────────────────────────────────────
function openTimer(id, name) {
  timerProbId = id;
  el('timerProblemName').textContent = '⏱️ '+name;
  timerSeconds = timesMap[id]||0;
  timerRunning = false;
  el('timerStartStop').textContent = '▶ Start';
  el('timerDisplay').textContent = fmtTime(timerSeconds);
  el('timerLog').innerHTML = '';
  el('timerModal').style.display = 'flex';
}
function closeTimer() {
  if (timerRunning) timerToggle();
  el('timerModal').style.display = 'none';
  timerProbId = null;
}
function timerToggle() {
  if (timerRunning) {
    clearInterval(timerInterval); timerRunning=false;
    el('timerStartStop').textContent='▶ Resume';
    timesMap[timerProbId] = timerSeconds;
    saveObj(KEY_TIMES, timesMap);
    const entry = document.createElement('div');
    entry.className = 'timer-log-entry';
    entry.textContent = 'Saved: '+fmtTime(timerSeconds);
    el('timerLog').prepend(entry);
    // Update row
    const badge = document.querySelector('tr[data-id="'+timerProbId+'"] .time-badge');
    if (badge) badge.textContent='⏱ '+fmtTime(timerSeconds);
  } else {
    timerRunning=true;
    el('timerStartStop').textContent='⏸ Pause';
    timerInterval = setInterval(()=>{
      timerSeconds++;
      el('timerDisplay').textContent=fmtTime(timerSeconds);
    },1000);
  }
}
function timerReset() {
  clearInterval(timerInterval); timerRunning=false; timerSeconds=0;
  el('timerDisplay').textContent='00:00';
  el('timerStartStop').textContent='▶ Start';
}
function fmtTime(s){ const m=Math.floor(s/60),sec=s%60; return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0'); }

// ── Export CSV ─────────────────────────────────────────────────────
function exportCSV() {
  const headers = ['#','Category','Problem','Difficulty','Solved','Bookmarked','Revision','Time','Notes','LeetCode','GFG'];
  const rows = allProblems.map(p => {
    const lc = p.links.find(l=>l.label==='LeetCode');
    const gfg= p.links.find(l=>l.label==='GFG');
    return [
      p.num, p.category, '"'+p.name.replace(/"/g,'""')+'"', p.difficulty,
      solvedSet.has(p.id)?'Yes':'No',
      bookmarkSet.has(p.id)?'Yes':'No',
      revisionSet.has(p.id)?'Yes':'No',
      timesMap[p.id]?fmtTime(timesMap[p.id]):'',
      '"'+(notesMap[p.id]||'').replace(/"/g,'""').replace(/\n/g,' ')+'"',
      lc?lc.url:'', gfg?gfg.url:''
    ].join(',');
  });
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'dsa-sheet-'+todayStr()+'.csv';
  a.click();
}

// ── Helpers ────────────────────────────────────────────────────────
function el(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function todayStr(){ return dateStr(new Date()); }
function dateStr(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function getCatIcon(cat){ if(CAT_ICONS[cat]) return CAT_ICONS[cat]; for(const [k,v] of Object.entries(CAT_ICONS)) if(cat.toLowerCase().includes(k.toLowerCase())) return v; return '📝'; }

// Storage helpers
function loadSet(key){ try{ const r=localStorage.getItem(key); return r?new Set(JSON.parse(r)):new Set(); }catch(e){return new Set();} }
function saveSet(key,s){ localStorage.setItem(key,JSON.stringify([...s])); }
function loadObj(key){ try{ const r=localStorage.getItem(key); return r?JSON.parse(r):{}; }catch(e){return {};} }
function saveObj(key,o){ localStorage.setItem(key,JSON.stringify(o)); }

// Theme
function loadTheme(){ applyTheme(localStorage.getItem(KEY_THEME)||'dark'); }
function toggleTheme(){ applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'); }
function applyTheme(t){ document.documentElement.setAttribute('data-theme',t); localStorage.setItem(KEY_THEME,t); el('themeToggle').textContent=t==='dark'?'☀️':'🌙'; }