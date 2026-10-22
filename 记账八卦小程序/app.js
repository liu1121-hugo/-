/* ===== 记账应用核心逻辑 ===== */

/* 内置分类：不可删除。wx = 五行索引（0金 1木 2水 3火 4土） */
const BUILTIN_CATEGORIES = [
  { name: '餐饮', icon: '🍽', color: '#FF9500', wx: 2, builtin: true },
  { name: '交通', icon: '🚗', color: '#5AC8FA', wx: 0, builtin: true },
  { name: '购物', icon: '🛍', color: '#FF2D92', wx: 4, builtin: true },
  { name: '娱乐', icon: '🎮', color: '#AF52DE', wx: 3, builtin: true },
  { name: '住房', icon: '🏠', color: '#34C759', wx: 4, builtin: true },
  { name: '医疗', icon: '💊', color: '#FF3B30', wx: 1, builtin: true },
  { name: '教育', icon: '📚', color: '#5856D6', wx: 1, builtin: true },
  { name: '通讯', icon: '📱', color: '#0071E3', wx: 3, builtin: true },
  { name: '其他', icon: '📦', color: '#8E8E93', wx: 4, builtin: true },
];

/* CATEGORIES 为可变数组：内置 + 自定义。全应用通过它读取分类，故增删后自动生效 */
let CATEGORIES = BUILTIN_CATEGORIES.map(c => ({ ...c }));
let CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.name, c]));

const STORAGE_KEY = 'expense_records_v1';
const BUDGET_KEY = 'expense_budget_v1';
const CUSTOM_CAT_KEY = 'expense_custom_cats_v1';

/* 自定义分类可选图标与颜色 */
const CAT_ICON_POOL = ['🏷','🎁','🐾','✈️','💄','🎵','⚽','🍺','☕','💻','🔧','🌿','🎨','📷','🚿','🧾','💡','🎓','🏥','🚌'];
const CAT_COLOR_POOL = ['#FF9500','#5AC8FA','#FF2D92','#AF52DE','#34C759','#FF3B30','#5856D6','#0071E3','#8E8E93','#FFCC00','#00D4FF','#00FF88'];

/* 金额区间：lo 含、hi 不含（最后一档 hi = Infinity） */
const AMOUNT_BUCKETS = [
  { key: 'b0',   label: '20元以下',   lo: 0,    hi: 20 },
  { key: 'b20',  label: '20-50元',    lo: 20,   hi: 50 },
  { key: 'b50',  label: '50-100元',   lo: 50,   hi: 100 },
  { key: 'b100', label: '100-500元',  lo: 100,  hi: 500 },
  { key: 'b500', label: '500元以上',  lo: 500,  hi: Infinity },
];

let state = {
  records: [],
  budget: 0,
  selectedCategory: '餐饮',
  filter: 'all',
  typeFilter: new Set(),      // 选中分类名；空集 = 不限
  amountBuckets: new Set(),   // 选中区间 key；与 amountRange 为「或」关系
  amountRange: { min: null, max: null },   // 自定义区间，边界均含
};

/* ===== 分类管理（内置 + 自定义） ===== */
/* 关键词 → 五行索引。用于新建分类时猜测，用户可改 */
const WX_KEYWORDS = {
  2: ['餐','饭','食','饮','水','茶','酒','咖啡','奶茶','外卖','菜','汤','火锅','烧烤','早','午','晚','宵夜'],
  0: ['交通','车','地铁','公交','打车','油','票','机场','高铁','出租','停车','金','银','理财','保险','五金','机械'],
  1: ['教育','书','学','课','培训','文具','文具','植物','花','木','绿','药材','医药','医疗','保健'],
  3: ['娱乐','玩','游戏','电影','影','歌','音乐','演出','旅','游','运动','健身','电','灯','通讯','手机','话费','网'],
  4: ['住房','房','租','物业','家','家具','日用','超市','杂','其他','稳','存','储蓄','装修'],
};

function guessWuxing(name) {
  const n = String(name || '');
  if (!n) return 4;
  // 按关键词命中数打分，取最高分；同分时按 水>金>木>火>土 顺序（越靠前优先级越高）
  const order = [2, 0, 1, 3, 4];
  let best = -1, bestScore = 0;
  for (const wx of order) {
    let score = 0;
    for (const kw of WX_KEYWORDS[wx]) {
      if (n.includes(kw)) score += kw.length;   // 更长的关键词权重更高
    }
    if (score > bestScore) { bestScore = score; best = wx; }
  }
  return best >= 0 ? best : 4;   // 无命中 → 土（同「其他」）
}

function rebuildCatMap() {
  CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.name, c]));
}

function loadCustomCategories() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_CAT_KEY)) || [];
    const customs = saved
      .filter(c => c && typeof c.name === 'string' && c.name.trim())
      .map(c => ({
        name: c.name,
        icon: c.icon || '🏷',
        color: c.color || '#8E8E93',
        wx: Number.isInteger(c.wx) && c.wx >= 0 && c.wx <= 4 ? c.wx : guessWuxing(c.name),
        builtin: false,
      }));
    CATEGORIES = BUILTIN_CATEGORIES.map(c => ({ ...c })).concat(customs);
    rebuildCatMap();
  } catch {
    CATEGORIES = BUILTIN_CATEGORIES.map(c => ({ ...c }));
    rebuildCatMap();
  }
}

function saveCustomCategories() {
  const customs = CATEGORIES.filter(c => !c.builtin);
  try {
    localStorage.setItem(CUSTOM_CAT_KEY, JSON.stringify(customs));
  } catch {}
}

function isBuiltinCategory(name) {
  return BUILTIN_CATEGORIES.some(c => c.name === name);
}

function addCustomCategory(name, icon, color, wx) {
  const trimmed = String(name || '').trim();
  if (!trimmed) { toast('请输入分类名称'); return false; }
  if (trimmed.length > 8) { toast('分类名称最多 8 个字'); return false; }
  if (CAT_MAP[trimmed]) { toast(`分类「${trimmed}」已存在`); return false; }
  CATEGORIES.push({
    name: trimmed,
    icon: icon || '🏷',
    color: color || '#8E8E93',
    wx: Number.isInteger(wx) ? wx : guessWuxing(trimmed),
    builtin: false,
  });
  rebuildCatMap();
  saveCustomCategories();
  return true;
}

function deleteCustomCategory(name) {
  const cat = CAT_MAP[name];
  if (!cat) return false;
  if (cat.builtin) { toast('内置分类不可删除'); return false; }
  const used = state.records.filter(r => r.category === name).length;
  if (used > 0) {
    toast(`该分类下还有 ${used} 笔记录，无法删除`);
    return false;
  }
  CATEGORIES = CATEGORIES.filter(c => c.name !== name);
  rebuildCatMap();
  saveCustomCategories();
  state.typeFilter.delete(name);
  // 若当前选中的正是被删分类，回退到第一个分类
  if (state.selectedCategory === name) state.selectedCategory = CATEGORIES[0].name;
  return true;
}

/* ===== 分类管理 UI ===== */
const WX_LABELS = ['金', '木', '水', '火', '土'];
let newCatIcon = CAT_ICON_POOL[0];
let newCatColor = CAT_COLOR_POOL[0];
let newCatWx = 4;
let newCatWxTouched = false;   // 用户是否手动改过五行

function renderCatPickLists() {
  const iconEl = $('#newCatIcons');
  const colorEl = $('#newCatColors');
  const wxEl = $('#newCatWuxing');
  if (iconEl) {
    iconEl.innerHTML = CAT_ICON_POOL.map(i =>
      `<button type="button" class="cat-pick${i === newCatIcon ? ' active' : ''}" data-icon="${i}">${i}</button>`
    ).join('');
  }
  if (colorEl) {
    colorEl.innerHTML = CAT_COLOR_POOL.map(c =>
      `<button type="button" class="cat-pick cat-pick-color${c === newCatColor ? ' active' : ''}" data-color="${c}" style="--pick-color:${c}"></button>`
    ).join('');
  }
  if (wxEl) {
    wxEl.innerHTML = WX_LABELS.map((label, i) =>
      `<button type="button" class="cat-pick cat-pick-wx${i === newCatWx ? ' active' : ''}" data-wx="${i}">${label}</button>`
    ).join('');
  }
}

function updateWxHint() {
  const hint = $('#newCatWxHint');
  if (!hint) return;
  const name = ($('#newCatName') && $('#newCatName').value || '').trim();
  if (!name) { hint.textContent = '输入名称后将自动推荐五行，可手动更改'; return; }
  const guess = guessWuxing(name);
  if (newCatWxTouched) {
    hint.textContent = `已手动指定五行：${WX_LABELS[newCatWx]}（系统推荐 ${WX_LABELS[guess]}）`;
  } else {
    newCatWx = guess;
    hint.textContent = `已根据名称自动推荐五行：${WX_LABELS[guess]}（可手动更改）`;
    renderCatPickLists();
  }
}

function renderCustomCatList() {
  const el = $('#customCatList');
  if (!el) return;
  const customs = CATEGORIES.filter(c => !c.builtin);
  if (customs.length === 0) {
    el.innerHTML = `<div class="cat-manage-empty">还没有自定义分类</div>`;
    return;
  }
  el.innerHTML = customs.map(c => {
    const used = state.records.filter(r => r.category === c.name).length;
    return `<div class="cat-manage-item">
      <span class="cat-manage-item-icon" style="background:${c.color}22">${c.icon}</span>
      <span class="cat-manage-item-name">${c.name}</span>
      <span class="cat-manage-item-wx">${WX_LABELS[c.wx] || '土'}</span>
      <span class="cat-manage-item-used">${used} 笔</span>
      <button type="button" class="cat-manage-del" data-del-cat="${c.name}" title="删除分类">✕</button>
    </div>`;
  }).join('');
}

function handleAddCategory() {
  const nameEl = $('#newCatName');
  const name = nameEl ? nameEl.value.trim() : '';
  if (addCustomCategory(name, newCatIcon, newCatColor, newCatWx)) {
    nameEl.value = '';
    newCatWxTouched = false;
    rebuildCylinder();      // 圆柱体加入新分类
    renderCatPickLists();
    updateWxHint();
    renderCustomCatList();
    renderAdvFilter();      // 筛选 chips 同步
    toast(`已添加分类「${name}」`);
  }
}

function handleDeleteCategory(name) {
  const cat = CAT_MAP[name];
  if (!cat) return;

  // 先做可删除性校验：不合规直接提示，不弹确认框
  if (cat.builtin) { toast('内置分类不可删除'); return; }
  const used = state.records.filter(r => r.category === name).length;
  if (used > 0) { toast(`该分类下还有 ${used} 笔记录，无法删除`); return; }

  const wxLabel = WX_LABELS[cat.wx] || '土';
  showConfirm({
    icon: cat.icon || '🗑',
    title: `删除分类「${name}」？`,
    desc: `<div class="modal-cat-preview">
        <span class="cat-manage-item-icon" style="background:${escapeHtml(cat.color)}22">${escapeHtml(cat.icon)}</span>
        <span class="cat-manage-item-name">${escapeHtml(name)}</span>
        <span class="cat-manage-item-wx">${escapeHtml(wxLabel)}</span>
      </div>
      <div>该分类暂无消费记录。删除后将从分类列表和记账选择器中移除，<strong>此操作不可撤销</strong>。</div>`,
    okText: '删除',
    cancelText: '取消',
    danger: true,
  }).then(confirmed => {
    if (!confirmed) return;
    // 二次校验：弹窗期间数据可能已变化（例如新增了该分类的记录）
    if (deleteCustomCategory(name)) {
      rebuildCylinder();
      renderCustomCatList();
      renderAdvFilter();
      renderRecordList();
      toast(`已删除分类「${name}」`);
    }
  });
}

/* ===== 月度对比 ===== */
let monthRange = 6;   // 近 N 月

/* 返回最近 n 个月的 [{year, month, key, label}]，按时间升序 */
function getRecentMonths(n) {
  const now = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      label: `${d.getMonth()+1}月`,
    });
  }
  return out;
}

function renderMonthCompare() {
  const svg = $('#monthChart');
  if (!svg) return;
  const months = getRecentMonths(monthRange);
  const data = months.map(m => {
    const recs = getMonthRecords(m.year, m.month);
    return { ...m, total: recs.reduce((s, r) => s + r.amount, 0), count: recs.length };
  });

  const W = 600, H = 260;
  const padL = 52, padR = 16, padT = 20, padB = 40;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxVal = Math.max(...data.map(d => d.total), 0);
  const yMax = maxVal > 0 ? Math.ceil(maxVal / 100) * 100 : 100;
  const yTicks = 4;
  const stepX = chartW / data.length;
  const barW = Math.min(stepX * 0.5, 48);

  let html = '';
  // Y 轴网格
  for (let i = 0; i <= yTicks; i++) {
    const y = padT + chartH * (1 - i / yTicks);
    html += `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`;
    html += `<text x="${padL-8}" y="${y+4}" text-anchor="end" font-size="10" fill="#71717A" font-family="inherit">${fmtMoneyShort(yMax * i / yTicks)}</text>`;
  }

  // 柱体
  data.forEach((d, i) => {
    const cx = padL + i * stepX + stepX / 2;
    const x = cx - barW / 2;
    const barH = d.total > 0 ? (d.total / yMax) * chartH : 0;
    const y = padT + chartH - barH;
    const isCurrent = i === data.length - 1;
    const fill = isCurrent ? '#6366F1' : '#3F3F46';
    if (d.total > 0) {
      html += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="5" fill="${fill}" opacity="0.9"/>`;
      html += `<text x="${cx.toFixed(1)}" y="${(y-6).toFixed(1)}" text-anchor="middle" font-size="10" fill="${isCurrent ? '#A5B4FC' : '#A1A1AA'}" font-family="inherit" font-weight="600">${fmtMoneyShort(d.total)}</text>`;
    } else {
      html += `<rect x="${x.toFixed(1)}" y="${(padT+chartH-2).toFixed(1)}" width="${barW.toFixed(1)}" height="2" rx="1" fill="#3F3F46" opacity="0.5"/>`;
    }
    // 环比标注
    if (i > 0) {
      const prev = data[i-1].total;
      if (prev > 0 && d.total > 0) {
        const pct = (d.total - prev) / prev * 100;
        const up = pct >= 0;
        html += `<text x="${cx.toFixed(1)}" y="${(padT+chartH+16).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="${up ? '#FF3366' : '#00FF88'}" font-family="inherit">${up?'▲':'▼'}${Math.abs(pct).toFixed(0)}%</text>`;
      }
    }
    // X 轴月份
    html += `<text x="${cx.toFixed(1)}" y="${H-padB+34}" text-anchor="middle" font-size="11" fill="${isCurrent ? '#EDEDEF' : '#71717A'}" font-family="inherit" font-weight="${isCurrent?'700':'400'}">${d.label}</text>`;
  });

  svg.innerHTML = html;

  // 文字摘要
  const summaryEl = $('#monthSummary');
  if (summaryEl) {
    const cur = data[data.length - 1];
    const prev = data.length > 1 ? data[data.length - 2] : null;
    const parts = [`本月 ${fmtMoneyShort(cur.total)}`];
    if (prev && prev.total > 0) {
      const pct = (cur.total - prev.total) / prev.total * 100;
      parts.push(`环比上月 ${pct >= 0 ? '↑' : '↓'}${Math.abs(pct).toFixed(1)}%`);
    } else if (prev && cur.total > 0) {
      parts.push('上月无消费，无法计算环比');
    }
    const active = data.filter(d => d.total > 0).length;
    parts.push(`统计区间内 ${active} 个月有消费`);
    summaryEl.textContent = parts.join(' · ');
  }

  renderCategoryCompare(data);
}

/* 分类维度对比：本月 vs 上月，各分类双向条形 */
function renderCategoryCompare(monthData) {
  const el = $('#catCompareList');
  const subEl = $('#catCompareSub');
  if (!el) return;
  const cur = monthData[monthData.length - 1];
  const prev = monthData.length > 1 ? monthData[monthData.length - 2] : null;

  if (subEl) {
    subEl.textContent = prev ? `${cur.year}年${cur.month+1}月 vs ${prev.year}年${prev.month+1}月` : '本月 vs 上月';
  }
  if (!prev) {
    el.innerHTML = `<div class="cat-manage-empty">暂无上月数据可对比</div>`;
    return;
  }

  const curStats = getCategoryStats(getMonthRecords(cur.year, cur.month));
  const prevStats = getCategoryStats(getMonthRecords(prev.year, prev.month));
  const names = new Set([...curStats.map(s => s.name), ...prevStats.map(s => s.name)]);
  if (names.size === 0) {
    el.innerHTML = `<div class="cat-manage-empty">本月与上月均无消费记录</div>`;
    return;
  }

  const curMap = Object.fromEntries(curStats.map(s => [s.name, s.amount]));
  const prevMap = Object.fromEntries(prevStats.map(s => [s.name, s.amount]));
  const rows = [...names].map(name => ({
    name,
    cur: curMap[name] || 0,
    prev: prevMap[name] || 0,
    cat: CAT_MAP[name] || { icon: '📦', color: '#8E8E93' },
  }));
  // 按「本月金额」降序，本月为 0 的排后面
  rows.sort((a, b) => b.cur - a.cur || b.prev - a.prev);

  const maxVal = Math.max(...rows.map(r => Math.max(r.cur, r.prev)), 1);

  el.innerHTML = rows.map(r => {
    const curW = r.cur / maxVal * 100;
    const prevW = r.prev / maxVal * 100;
    let deltaHtml = '<span class="cc-delta cc-delta-none">—</span>';
    if (r.prev > 0 && r.cur > 0) {
      const pct = (r.cur - r.prev) / r.prev * 100;
      const cls = pct >= 0 ? 'up' : 'down';
      deltaHtml = `<span class="cc-delta cc-delta-${cls}">${pct >= 0 ? '▲' : '▼'}${Math.abs(pct).toFixed(0)}%</span>`;
    } else if (r.prev === 0 && r.cur > 0) {
      deltaHtml = `<span class="cc-delta cc-delta-new">新增</span>`;
    } else if (r.cur === 0 && r.prev > 0) {
      deltaHtml = `<span class="cc-delta cc-delta-down">已停</span>`;
    }
    return `<div class="cc-row">
      <div class="cc-name">
        <span class="cc-icon" style="background:${r.cat.color}22">${r.cat.icon}</span>
        <span class="cc-cat">${r.name}</span>
      </div>
      <div class="cc-bars">
        <div class="cc-bar-line">
          <div class="cc-bar cc-bar-cur" style="width:${curW.toFixed(1)}%;background:${r.cat.color}"></div>
          <span class="cc-val">${r.cur > 0 ? fmtMoneyShort(r.cur) : '—'}</span>
        </div>
        <div class="cc-bar-line">
          <div class="cc-bar cc-bar-prev" style="width:${prevW.toFixed(1)}%"></div>
          <span class="cc-val cc-val-prev">${r.prev > 0 ? fmtMoneyShort(r.prev) : '—'}</span>
        </div>
      </div>
      <div class="cc-delta-wrap">${deltaHtml}</div>
    </div>`;
  }).join('');
}

/* HTML 转义：用于把用户输入（分类名、备注等）安全插入 innerHTML */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ===== 确认弹窗 =====
   返回 Promise<boolean>；支持 ESC / 点击遮罩 / 取消按钮 三种取消方式。
   同一时刻只允许一个弹窗，重复调用会先关闭上一个。 */
let _confirmResolve = null;
let _confirmKeyHandler = null;

function closeConfirm(result) {
  const modal = $('#confirmModal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (_confirmKeyHandler) {
    document.removeEventListener('keydown', _confirmKeyHandler);
    _confirmKeyHandler = null;
  }
  const resolve = _confirmResolve;
  _confirmResolve = null;
  if (resolve) resolve(result);
}

function showConfirm(opts) {
  const o = opts || {};
  const modal = $('#confirmModal');
  if (!modal) return Promise.resolve(false);
  // 若已有弹窗未关闭，先按「取消」结算，避免 Promise 悬挂
  if (_confirmResolve) closeConfirm(false);

  $('#confirmIcon').textContent = o.icon || '⚠️';
  $('#confirmTitle').textContent = o.title || '确认操作';
  $('#confirmDesc').innerHTML = o.desc || '';
  const okBtn = $('#confirmOk');
  okBtn.textContent = o.okText || '确定';
  okBtn.classList.toggle('danger', o.danger !== false);   // 默认按危险操作样式
  $('#confirmCancel').textContent = o.cancelText || '取消';

  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  _confirmKeyHandler = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeConfirm(false); }
    else if (e.key === 'Enter') { e.preventDefault(); closeConfirm(true); }
  };
  document.addEventListener('keydown', _confirmKeyHandler);

  // 焦点移到「取消」，回车不会误触发删除
  setTimeout(() => { const c = $('#confirmCancel'); if (c && c.focus) c.focus(); }, 0);

  return new Promise(resolve => { _confirmResolve = resolve; });
}

/* ===== 工具函数 ===== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function fmtMoney(n) {
  return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMoneyShort(n) {
  if (n >= 10000) return '¥' + (n / 10000).toFixed(1) + '万';
  return '¥' + Math.round(n).toLocaleString('zh-CN');
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ===== 数据持久化 ===== */
function loadData() {
  try {
    state.records = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { state.records = []; }
  state.budget = Number(localStorage.getItem(BUDGET_KEY)) || 0;
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
}

function saveBudget() {
  localStorage.setItem(BUDGET_KEY, String(state.budget));
}

/* ===== 视图切换 ===== */
function switchView(view) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $$('.tab-btn').forEach(b => b.classList.remove('active'));
  $(`#view${view.charAt(0).toUpperCase()+view.slice(1)}`).classList.add('active');
  $(`.tab-btn[data-view="${view}"]`).classList.add('active');
  if (view === 'analysis') renderAnalysis();
  if (view === 'advice') renderAdvice();
}

/* ===== 记账：添加记录 ===== */
/* 重复记账检测：与「最近 3 笔」比较 金额 + 消费类型 是否完全相同 */
const DUP_CHECK_COUNT = 3;

function toCents(v) { return Math.round(Number(v) * 100); }

function findDuplicateRecord(amount, category) {
  const recent = state.records.slice(0, DUP_CHECK_COUNT);   // records 为最新在前
  const cents = toCents(amount);
  return recent.find(r => toCents(r.amount) === cents && r.category === category) || null;
}

/* 真正写入记录（确认无重复或用户坚持记账后调用） */
function commitRecord(amount, category, date, note) {
  const rec = {
    id: Date.now() + Math.random(),
    amount,
    category,
    date,
    note,
  };
  state.records.unshift(rec);
  saveRecords();
  $('#amount').value = '';
  $('#note').value = '';
  $('#amount').focus();
  toast(`已记录 ${fmtMoney(rec.amount)}`);
  renderRecordList();
  renderTodayCard();
  return rec;
}

function addRecord(e) {
  if (e && e.preventDefault) e.preventDefault();
  const amount = parseFloat($('#amount').value);
  if (!amount || amount <= 0) { toast('请输入有效金额'); return; }
  const date = $('#date').value || todayStr();
  const note = $('#note').value.trim();
  const rounded = Math.round(amount * 100) / 100;
  const category = state.selectedCategory;

  const dup = findDuplicateRecord(rounded, category);
  if (!dup) {
    commitRecord(rounded, category, date, note);
    return;
  }

  const cat = CAT_MAP[category] || { icon: '📦', color: '#8E8E93' };
  showConfirm({
    icon: '🔁',
    title: '可能重复记账',
    desc: `
      <div class="modal-cat-preview">
        <span class="cat-manage-item-icon" style="background:${escapeHtml(cat.color)}22">${escapeHtml(cat.icon)}</span>
        <span class="cat-manage-item-name">${escapeHtml(category)}</span>
        <span class="modal-amt">${fmtMoney(rounded)}</span>
      </div>
      <div>最近 3 笔中已有一笔金额与类型完全相同：</div>
      <div class="modal-dup-prev">
        <span>${escapeHtml(formatDateLabel(dup.date))}</span>
        <span>${escapeHtml(dup.date.slice(5))}</span>
        <span>${escapeHtml(dup.category)}</span>
        <span class="modal-dup-amt">${fmtMoney(dup.amount)}</span>
        ${dup.note ? `<span class="modal-dup-note">${escapeHtml(dup.note)}</span>` : ''}
      </div>
      <div style="margin-top:10px">确认这是两笔真实消费，仍要记录吗？</div>`,
    okText: '仍然记账',
    cancelText: '取消',
    danger: false,
  }).then(confirmed => {
    if (!confirmed) {
      toast('已取消记账');
      return;
    }
    commitRecord(rounded, category, date, note);
  });
}

function deleteRecord(id) {
  state.records = state.records.filter(r => r.id !== id);
  saveRecords();
  renderRecordList();
  renderTodayCard();
  toast('已删除');
}

/* ===== 记账：渲染今日卡片 ===== */
function renderTodayCard() {
  const today = todayStr();
  const todayRecs = state.records.filter(r => r.date === today);
  const total = todayRecs.reduce((s, r) => s + r.amount, 0);
  $('#todayAmount').textContent = fmtMoney(total);
  $('#todayMeta').textContent = todayRecs.length > 0
    ? `${todayRecs.length} 笔 · ${todayRecs[0].category} 等`
    : '还没有记录';
}

/* ===== 记账：渲染记录列表 ===== */
function getTimeFilteredRecords() {
  const now = new Date();
  if (state.filter === 'week') {
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    monday.setHours(0,0,0,0);
    return state.records.filter(r => new Date(r.date) >= monday);
  }
  if (state.filter === 'month') {
    const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    return state.records.filter(r => r.date.startsWith(ym));
  }
  return state.records;
}

/* 是否处于「金额筛选生效」状态 */
function hasAmountFilter() {
  return state.amountBuckets.size > 0 || state.amountRange.min !== null || state.amountRange.max !== null;
}

function matchAmountFilter(amount) {
  const buckets = state.amountBuckets;
  const { min, max } = state.amountRange;
  const hasCustom = min !== null || max !== null;
  if (buckets.size === 0 && !hasCustom) return true;
  // 预置区间与自定义区间为「或」：命中任一即通过
  for (const key of buckets) {
    const b = AMOUNT_BUCKETS.find(x => x.key === key);
    if (b && amount >= b.lo && amount < b.hi) return true;
  }
  if (hasCustom) {
    if (min !== null && amount < min) return false;
    if (max !== null && amount > max) return false;
    return true;
  }
  return false;
}

function getFilteredRecords() {
  return getTimeFilteredRecords().filter(r => {
    if (state.typeFilter.size > 0 && !state.typeFilter.has(r.category)) return false;
    if (!matchAmountFilter(r.amount)) return false;
    return true;
  });
}

/* ===== 高级筛选：渲染 chips ===== */
const AMOUNT_CHIP_COLOR = '#00D4FF';

function renderTypeFilterChips() {
  const el = $('#typeFilterChips');
  if (!el) return;
  const base = getTimeFilteredRecords();
  el.innerHTML = CATEGORIES.map(c => {
    const active = state.typeFilter.has(c.name) ? ' active' : '';
    const count = base.filter(r => r.category === c.name).length;
    return `<button type="button" class="adv-chip${active}" data-type="${c.name}"
      style="--chip-color:${c.color};--chip-bg:${c.color}22">
      ${c.icon} ${c.name}<span class="adv-chip-count">${count}</span>
    </button>`;
  }).join('');
}

function renderAmountFilterChips() {
  const el = $('#amountFilterChips');
  if (!el) return;
  const base = getTimeFilteredRecords().filter(r =>
    state.typeFilter.size === 0 || state.typeFilter.has(r.category));
  el.innerHTML = AMOUNT_BUCKETS.map(b => {
    const active = state.amountBuckets.has(b.key) ? ' active' : '';
    const count = base.filter(r => r.amount >= b.lo && r.amount < b.hi).length;
    return `<button type="button" class="adv-chip${active}" data-bucket="${b.key}"
      style="--chip-color:${AMOUNT_CHIP_COLOR};--chip-bg:${AMOUNT_CHIP_COLOR}22">
      ${b.label}<span class="adv-chip-count">${count}</span>
    </button>`;
  }).join('');
}

function renderAdvFilterSummary() {
  const el = $('#advFilterSummary');
  const resetBtn = $('#advFilterReset');
  if (!el) return;
  const parts = [];
  if (state.typeFilter.size > 0) {
    parts.push(state.typeFilter.size <= 2
      ? [...state.typeFilter].join('、')
      : `类型 ${state.typeFilter.size} 项`);
  }
  const bucketLabels = [...state.amountBuckets]
    .map(k => (AMOUNT_BUCKETS.find(b => b.key === k) || {}).label)
    .filter(Boolean);
  if (bucketLabels.length > 0) {
    parts.push(bucketLabels.length <= 2 ? bucketLabels.join('、') : `金额 ${bucketLabels.length} 档`);
  }
  const { min, max } = state.amountRange;
  if (min !== null && max !== null) parts.push(`¥${min}~¥${max}`);
  else if (min !== null) parts.push(`≥¥${min}`);
  else if (max !== null) parts.push(`≤¥${max}`);
  el.textContent = parts.length > 0 ? '已筛选：' + parts.join(' · ') : '';
  if (resetBtn) resetBtn.disabled = parts.length === 0;
}

function renderAdvFilter() {
  renderTypeFilterChips();
  renderAmountFilterChips();
  renderAdvFilterSummary();
}

function toggleTypeFilter(name) {
  if (state.typeFilter.has(name)) state.typeFilter.delete(name);
  else state.typeFilter.add(name);
  renderAdvFilter();
  renderRecordList();
}

function toggleAmountBucket(key) {
  if (state.amountBuckets.has(key)) state.amountBuckets.delete(key);
  else state.amountBuckets.add(key);
  renderAdvFilter();
  renderRecordList();
}

function applyAmountRange() {
  const minRaw = $('#amountMin').value.trim();
  const maxRaw = $('#amountMax').value.trim();
  const min = minRaw === '' ? null : Number(minRaw);
  const max = maxRaw === '' ? null : Number(maxRaw);
  if ((min !== null && (!isFinite(min) || min < 0)) || (max !== null && (!isFinite(max) || max < 0))) {
    toast('请输入有效的金额');
    return;
  }
  if (min !== null && max !== null && min > max) {
    toast('最低金额不能大于最高金额');
    return;
  }
  state.amountRange = { min, max };
  renderAdvFilter();
  renderRecordList();
}

function resetAdvFilter() {
  state.typeFilter.clear();
  state.amountBuckets.clear();
  state.amountRange = { min: null, max: null };
  const minEl = $('#amountMin'), maxEl = $('#amountMax');
  if (minEl) minEl.value = '';
  if (maxEl) maxEl.value = '';
  renderAdvFilter();
  renderRecordList();
  toast('已重置筛选');
}

function renderRecordList() {
  const list = $('#recordList');
  const recs = getFilteredRecords();
  if (recs.length === 0) {
    const filtered = isAdvFilterActive();
    list.innerHTML = filtered
      ? `<div class="empty-state"><div class="empty-icon">🔍</div><p>没有符合筛选条件的记录</p></div>`
      : `<div class="empty-state"><div class="empty-icon">📝</div><p>暂无消费记录</p></div>`;
    return;
  }
  let html = '';
  let lastDate = '';
  for (const r of recs) {
    if (r.date !== lastDate) {
      html += `<div class="date-divider">${formatDateLabel(r.date)}</div>`;
      lastDate = r.date;
    }
    const cat = CAT_MAP[r.category] || CAT_MAP['其他'];
    html += `
      <div class="record-item">
        <div class="item-icon" style="background:${cat.color}1A">${cat.icon}</div>
        <div class="item-body">
          <div class="item-cat">${r.category}</div>
          <div class="item-note">${r.note || '无备注'}</div>
        </div>
        <div class="item-date">${r.date.slice(5)}</div>
        <div class="item-amount">${fmtMoney(r.amount)}</div>
        <button class="item-delete" onclick="deleteRecord(${r.id})">✕</button>
      </div>`;
  }
  if (isAdvFilterActive()) {
    const sum = recs.reduce((s, r) => s + r.amount, 0);
    html += `<div class="record-filter-foot">筛选出 ${recs.length} 笔 · 合计 ${fmtMoney(sum)}</div>`;
  }
  list.innerHTML = html;
}

function isAdvFilterActive() {
  return state.typeFilter.size > 0 || hasAmountFilter();
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0,0,0,0);
  const diff = Math.round((today - d) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  return `${d.getMonth()+1}月${d.getDate()}日`;
}

/* ===== 分析：统计计算 ===== */
function getMonthRecords(year, month) {
  const ym = `${year}-${String(month+1).padStart(2,'0')}`;
  return state.records.filter(r => r.date.startsWith(ym));
}

function getCategoryStats(recs) {
  const map = {};
  for (const r of recs) {
    map[r.category] = (map[r.category] || 0) + r.amount;
  }
  return Object.entries(map)
    .map(([name, amount]) => ({ name, amount, ...CAT_MAP[name] }))
    .sort((a, b) => b.amount - a.amount);
}

/* ===== 分析：渲染概览 ===== */
function renderAnalysis() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthRecs = getMonthRecords(year, month);
  const monthTotal = monthRecs.reduce((s, r) => s + r.amount, 0);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const passedDays = now.getDate();
  const dailyAvg = monthTotal / passedDays;

  $('#statMonthTotal').textContent = fmtMoneyShort(monthTotal);
  $('#statMonthSub').textContent = `${monthRecs.length} 笔消费`;

  $('#statDailyAvg').textContent = fmtMoneyShort(dailyAvg);
  $('#statDailySub').textContent = `本月已过 ${passedDays} 天`;

  if (monthRecs.length > 0) {
    const maxRec = monthRecs.reduce((m, r) => r.amount > m.amount ? r : m);
    $('#statMaxSingle').textContent = fmtMoneyShort(maxRec.amount);
    $('#statMaxSub').textContent = `${maxRec.category} · ${maxRec.date.slice(5)}`;
  } else {
    $('#statMaxSingle').textContent = '¥0';
    $('#statMaxSub').textContent = '—';
  }

  // 环比上月
  const lastMonth = month === 0 ? 11 : month - 1;
  const lastYear = month === 0 ? year - 1 : year;
  const lastRecs = getMonthRecords(lastYear, lastMonth);
  const lastTotal = lastRecs.reduce((s, r) => s + r.amount, 0);
  if (lastTotal > 0 && monthTotal > 0) {
    const pct = ((monthTotal - lastTotal) / lastTotal * 100);
    const el = $('#statCompare');
    el.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
    el.className = 'stat-value ' + (pct >= 0 ? 'up' : 'down');
    $('#statCompareSub').textContent = `上月 ${fmtMoneyShort(lastTotal)}`;
  } else {
    $('#statCompare').textContent = '—';
    $('#statCompare').className = 'stat-value';
    $('#statCompareSub').textContent = '无上月数据';
  }

  renderDonut(monthRecs, monthTotal);
  renderTrend();
  renderRank(monthRecs, monthTotal);

  const baguaConsumption = getBaguaConsumption(monthRecs);
  renderBagua('baguaAnalysisSvg', baguaConsumption, { showAmounts: true });
  renderBaguaLegend(baguaConsumption, 'baguaAnalysisLegend');

  renderMonthCompare();
}

/* ===== 分析：环形图 ===== */
function renderDonut(recs, total) {
  const svg = $('#donutChart');
  const center = $('#donutCenter');
  const legend = $('#donutLegend');

  if (total === 0) {
    svg.innerHTML = `<circle cx="100" cy="100" r="70" fill="none" stroke="#F5F5F7" stroke-width="28"/>`;
    center.querySelector('.donut-total-value').textContent = '¥0';
    legend.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:16px">暂无数据</div>';
    return;
  }

  const stats = getCategoryStats(recs);
  const r = 70;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  let svgContent = '';

  for (const s of stats) {
    const portion = s.amount / total;
    const dash = portion * circ;
    svgContent += `<circle cx="100" cy="100" r="${r}" fill="none"
      stroke="${s.color}" stroke-width="28"
      stroke-dasharray="${dash} ${circ - dash}"
      stroke-dashoffset="${-offset}"
      stroke-linecap="butt"/>`;
    offset += dash;
  }
  svg.innerHTML = svgContent;
  center.querySelector('.donut-total-value').textContent = fmtMoneyShort(total);

  legend.innerHTML = stats.map(s => {
    const pct = (s.amount / total * 100).toFixed(1);
    return `<div class="legend-item">
      <span class="legend-dot" style="background:${s.color}"></span>
      <span class="legend-name">${s.name}</span>
      <span class="legend-pct">${pct}%</span>
      <span class="legend-val">${fmtMoneyShort(s.amount)}</span>
    </div>`;
  }).join('');
}

/* ===== 分析：趋势柱状图 ===== */
function renderTrend() {
  const svg = $('#trendChart');
  const days = 14;
  const now = new Date();
  const data = [];
  let maxVal = 0;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const total = state.records.filter(r => r.date === ds).reduce((s, r) => s + r.amount, 0);
    data.push({ date: ds, total, day: d.getDate(), weekday: d.getDay() });
    if (total > maxVal) maxVal = total;
  }

  const W = 600, H = 240;
  const padL = 40, padR = 16, padT = 16, padB = 36;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const barW = chartW / days * 0.6;
  const gap = chartW / days * 0.4;
  const stepX = chartW / days;

  const yMax = maxVal > 0 ? Math.ceil(maxVal / 100) * 100 : 100;
  const yTicks = 4;

  let html = '';

  // Y 轴刻度线
  for (let i = 0; i <= yTicks; i++) {
    const y = padT + chartH * (1 - i / yTicks);
    const val = yMax * i / yTicks;
    html += `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="#F5F5F7" stroke-width="1"/>`;
    html += `<text x="${padL-6}" y="${y+4}" text-anchor="end" font-size="10" fill="#AEAEB2" font-family="inherit">${Math.round(val)}</text>`;
  }

  // 柱子
  data.forEach((d, i) => {
    const x = padL + i * stepX + gap / 2;
    const barH = d.total > 0 ? (d.total / yMax) * chartH : 0;
    const y = padT + chartH - barH;
    const isToday = i === days - 1;
    html += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4"
      fill="${isToday ? '#0071E3' : '#D1D1D6'}" opacity="${d.total > 0 ? 1 : 0}"/>`;
    if (d.total > 0) {
      html += `<text x="${x + barW/2}" y="${y - 5}" text-anchor="middle" font-size="9" fill="#86868B" font-family="inherit">${Math.round(d.total)}</text>`;
    }
    // X 轴标签
    if (i % 2 === 0 || isToday) {
      html += `<text x="${x + barW/2}" y="${H - padB + 14}" text-anchor="middle" font-size="10" fill="${isToday ? '#0071E3' : '#AEAEB2'}" font-family="inherit" font-weight="${isToday?'600':'400'}">${d.day}</text>`;
    }
  });

  svg.innerHTML = html;
}

/* ===== 分析：分类排行 ===== */
function renderRank(recs, total) {
  const list = $('#rankList');
  if (total === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>本月暂无消费数据</p></div>';
    return;
  }
  const stats = getCategoryStats(recs);
  const maxAmount = stats[0].amount;

  list.innerHTML = stats.map(s => {
    const pct = (s.amount / total * 100).toFixed(1);
    const barPct = (s.amount / maxAmount * 100);
    return `
      <div class="rank-item">
        <div class="rank-icon" style="background:${s.color}1A">${s.icon}</div>
        <div class="rank-info">
          <div class="rank-top">
            <span class="rank-name">${s.name}</span>
            <span class="rank-pct">${pct}%</span>
            <span class="rank-amount">${fmtMoney(s.amount)}</span>
          </div>
          <div class="rank-bar-wrap">
            <div class="rank-bar" style="width:${barPct}%;background:${s.color}"></div>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ===== 建议：智能分析引擎 ===== */
function renderAdvice() {
  renderBudget();
  if (state.baziData) {
    const monthRecs = getMonthRecords(new Date().getFullYear(), new Date().getMonth());
    const baguaConsumption = getBaguaConsumption(monthRecs);
    renderBagua('baguaPersonalSvg', baguaConsumption, { showAmounts: false });
    renderBaguaInterpretation(state.baziData, baguaConsumption);
    renderDailyFortune(state.baziData);
  }
  const list = $('#adviceList');
  const advices = generateAdvices();

  if (state.baziData) {
    const baguaAdvices = generateBaguaAdvices(state.baziData);
    const destinyAdvices = generateDestinyAdvices(state.baziData.wuxing, state.baziData.bazi);
    advices.unshift(...baguaAdvices, ...destinyAdvices);
  }

  if (advices.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">💡</div><p>记录更多消费后，将为你生成个性化建议</p></div>`;
    return;
  }

  list.innerHTML = advices.map(a => `
    <div class="advice-card type-${a.type} ${a.type === 'destiny' ? 'destiny-advice' : ''}">
      <div class="advice-icon">${a.icon}</div>
      <div class="advice-content">
        <div class="advice-title">${a.title}</div>
        <div class="advice-desc">${a.desc}</div>
        ${a.action ? `<div class="advice-action">${a.action}</div>` : ''}
      </div>
    </div>`).join('');
}

function generateAdvices() {
  const advices = [];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthRecs = getMonthRecords(year, month);
  const monthTotal = monthRecs.reduce((s, r) => s + r.amount, 0);
  const passedDays = now.getDate();
  const dailyAvg = monthTotal / passedDays;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const projectedTotal = dailyAvg * daysInMonth;

  if (monthRecs.length === 0) {
    advices.push({
      type: 'info', icon: '📝',
      title: '开始你的记账之旅',
      desc: '记录每一笔消费，了解钱花在了哪里，是理财的第一步。建议先记录一周，系统将为你提供个性化分析。',
    });
    return advices;
  }

  // 1. 预算预警
  if (state.budget > 0) {
    const usage = monthTotal / state.budget;
    if (usage >= 1) {
      advices.push({
        type: 'danger', icon: '⚠️',
        title: '本月预算已超支',
        desc: `本月已消费 ${fmtMoney(monthTotal)}，超出预算 ${fmtMoney(monthTotal - state.budget)}。建议立即审视消费结构，削减非必要支出。`,
        action: '查看分类占比，找出超支来源',
      });
    } else if (usage >= 0.8) {
      advices.push({
        type: 'warning', icon: '⚡',
        title: '预算使用接近上限',
        desc: `已用预算的 ${(usage*100).toFixed(0)}%，剩余 ${fmtMoney(state.budget - monthTotal)}。按当前速度，月底将 ${projectedTotal > state.budget ? '超支' : '在预算内'}。`,
        action: projectedTotal > state.budget ? '建议放缓非必要消费' : '保持当前节奏即可',
      });
    } else {
      advices.push({
        type: 'good', icon: '✅',
        title: '预算控制良好',
        desc: `已用预算的 ${(usage*100).toFixed(0)}%，剩余 ${fmtMoney(state.budget - monthTotal)}。继续保持！`,
      });
    }
  }

  // 2. 预测月度总支出
  if (passedDays >= 5) {
    if (state.budget > 0 && projectedTotal > state.budget) {
      advices.push({
        type: 'warning', icon: '📈',
        title: '月度支出预测超预算',
        desc: `按当前日均 ${fmtMoney(dailyAvg)} 计算，预计本月总支出约 ${fmtMoney(projectedTotal)}，将超出预算 ${fmtMoney(projectedTotal - state.budget)}。`,
        action: `每日需控制在 ${fmtMoney((state.budget - monthTotal) / (daysInMonth - passedDays))} 以内`,
      });
    } else if (state.budget === 0) {
      advices.push({
        type: 'info', icon: '🔮',
        title: '月度支出预测',
        desc: `按当前日均 ${fmtMoney(dailyAvg)} 计算，预计本月总支出约 ${fmtMoney(projectedTotal)}。设置预算可以更好地控制消费。`,
        action: '前往左侧设置月度预算',
      });
    }
  }

  // 3. 分类占比分析
  const stats = getCategoryStats(monthRecs);
  if (stats.length > 0) {
    const top = stats[0];
    const topPct = top.amount / monthTotal * 100;
    if (topPct > 40) {
      const tips = {
        '餐饮': '尝试自己做饭，每周可节省约 30-50% 的餐饮支出',
        '购物': '列购物清单，避免冲动消费，设置 24 小时冷静期',
        '娱乐': '寻找免费或低成本的娱乐替代方案，如公园、图书馆',
        '交通': '考虑公共交通、拼车或骑行，减少打车频率',
      };
      advices.push({
        type: 'warning', icon: '🎯',
        title: `${top.name}支出占比过高`,
        desc: `${top.name}占本月消费的 ${topPct.toFixed(1)}%（${fmtMoney(top.amount)}），建议适当控制。${tips[top.name] || '审视该类别是否有可优化空间。'}`,
      });
    }
  }

  // 4. 餐饮细分建议
  const diningRecs = monthRecs.filter(r => r.category === '餐饮');
  if (diningRecs.length >= 10) {
    const diningTotal = diningRecs.reduce((s, r) => s + r.amount, 0);
    const avgPerMeal = diningTotal / diningRecs.length;
    if (avgPerMeal > 50) {
      advices.push({
        type: 'info', icon: '🍽',
        title: '餐饮单笔偏高',
        desc: `本月餐饮 ${diningRecs.length} 笔，平均每笔 ${fmtMoney(avgPerMeal)}。如果其中包含聚餐，建议单独标记；日常餐费建议控制在 25-35 元/餐。`,
      });
    }
  }

  // 5. 高频小额消费
  const smallRecs = monthRecs.filter(r => r.amount < 20);
  if (smallRecs.length >= 15) {
    const smallTotal = smallRecs.reduce((s, r) => s + r.amount, 0);
    advices.push({
      type: 'info', icon: '🔍',
      title: '小额消费积少成多',
      desc: `本月 20 元以下消费共 ${smallRecs.length} 笔，合计 ${fmtMoney(smallTotal)}。这些"不起眼"的支出累计也是一笔不小的数目，留意是否有可省的零碎开支。`,
    });
  }

  // 6. 异常大额消费
  if (monthRecs.length >= 5) {
    const avgAmount = monthTotal / monthRecs.length;
    const bigRecs = monthRecs.filter(r => r.amount > avgAmount * 3 && r.amount > 200);
    for (const r of bigRecs.slice(0, 2)) {
      advices.push({
        type: 'info', icon: '💸',
        title: `大额消费提醒：${r.category}`,
        desc: `${r.date.slice(5)} 记录了一笔 ${fmtMoney(r.amount)} 的${r.category}支出${r.note ? `（${r.note}）` : ''}，是月均单笔的 ${(r.amount/avgAmount).toFixed(1)} 倍。确认是否为必要支出。`,
      });
    }
  }

  // 7. 消费趋势建议
  if (passedDays >= 7) {
    const recent7 = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      recent7.push(state.records.filter(r => r.date === ds).reduce((s, r) => s + r.amount, 0));
    }
    const recent7Total = recent7.reduce((s, v) => s + v, 0);
    const recent7Avg = recent7Total / 7;
    const prev7Start = new Date(now);
    prev7Start.setDate(now.getDate() - 14);
    const prev7End = new Date(now);
    prev7End.setDate(now.getDate() - 7);
    let prev7Total = 0;
    for (const r of state.records) {
      const rd = new Date(r.date);
      if (rd >= prev7Start && rd < prev7End) prev7Total += r.amount;
    }
    if (prev7Total > 0) {
      const change = (recent7Total - prev7Total) / prev7Total * 100;
      if (change > 20) {
        advices.push({
          type: 'warning', icon: '📊',
          title: '近期消费明显上升',
          desc: `近 7 天消费 ${fmtMoney(recent7Total)}，比前 7 天增加了 ${change.toFixed(0)}%。建议回顾近期消费明细，找出增长原因。`,
        });
      } else if (change < -15) {
        advices.push({
          type: 'good', icon: '🎉',
          title: '消费控制有进步',
          desc: `近 7 天消费比前 7 天减少了 ${Math.abs(change).toFixed(0)}%，消费习惯正在改善，继续保持！`,
        });
      }
    }
  }

  // 8. 节约建议
  if (monthTotal > 0) {
    const saveTips = [];
    const hasShopping = stats.find(s => s.name === '购物');
    const hasEntertain = stats.find(s => s.name === '娱乐');
    const hasTransport = stats.find(s => s.name === '交通');

    if (hasShopping && hasShopping.amount > monthTotal * 0.2) {
      saveTips.push(`购物占比 ${(hasShopping.amount/monthTotal*100).toFixed(0)}%，可尝试"30天愿望清单"法延迟非急需购买`);
    }
    if (hasTransport && hasTransport.amount > 300) {
      saveTips.push(`交通支出 ${fmtMoney(hasTransport.amount)}，多利用公共交通或步行可节省约 40%`);
    }
    if (hasEntertain && hasEntertain.amount > monthTotal * 0.15) {
      saveTips.push(`娱乐占比偏高，可探索免费替代活动如户外运动、阅读`);
    }

    if (saveTips.length > 0) {
      advices.push({
        type: 'good', icon: '💡',
        title: '节约小贴士',
        desc: saveTips.join('；') + '。',
      });
    }
  }

  // 9. 均衡消费表扬
  if (stats.length >= 5 && monthTotal > 0) {
    const topPct = stats[0].amount / monthTotal * 100;
    if (topPct < 30) {
      advices.push({
        type: 'good', icon: '🌟',
        title: '消费结构均衡',
        desc: `消费分布在 ${stats.length} 个类别中，最大类别占比仅 ${topPct.toFixed(0)}%，说明消费结构比较健康均衡。`,
      });
    }
  }

  return advices;
}

/* ===== 建议：预算 ===== */
function renderBudget() {
  const now = new Date();
  const monthRecs = getMonthRecords(now.getFullYear(), now.getMonth());
  const used = monthRecs.reduce((s, r) => s + r.amount, 0);
  const el = $('#budgetCurrent');
  const bar = $('#budgetBar');

  if (state.budget > 0) {
    el.textContent = fmtMoney(state.budget);
    const pct = Math.min(used / state.budget * 100, 100);
    bar.style.width = pct + '%';
    bar.style.background = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--orange)' : 'var(--blue)';
    $('#budgetUsed').textContent = `已用 ${fmtMoney(used)}`;
    $('#budgetRemain').textContent = `剩余 ${fmtMoney(Math.max(state.budget - used, 0))}`;
    $('#budgetInput').placeholder = `当前 ${state.budget}`;
  } else {
    el.textContent = '未设置';
    bar.style.width = '0%';
    $('#budgetUsed').textContent = `已用 ${fmtMoney(used)}`;
    $('#budgetRemain').textContent = '请设置预算';
    $('#budgetInput').placeholder = '设置月度预算';
  }
}

function setBudget() {
  const val = parseFloat($('#budgetInput').value);
  if (!val || val <= 0) { toast('请输入有效预算'); return; }
  state.budget = Math.round(val * 100) / 100;
  saveBudget();
  $('#budgetInput').value = '';
  toast(`预算已设为 ${fmtMoney(state.budget)}`);
  renderBudget();
  renderAdvice();
}

/* ===== 八字命理计算 ===== */
const TIANGAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const DIZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const WUXING = ['金','木','水','火','土'];
const WUXING_KEY = ['jin','mu','shui','huo','tu'];

const GAN_WX = [1,1,3,3,4,4,0,0,2,2];
const ZHI_WX = [2,4,1,1,4,3,3,4,0,0,4,2];

const JIEQI = [
  [1,6],[2,4],[3,6],[4,5],[5,6],[6,6],[7,7],[8,8],[9,8],[10,8],[11,7],[12,7]
];

function getYearPillar(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  let year = y;
  if (m === 1 || (m === 2 && d < 4)) year = y - 1;
  const gan = (year - 4 + 10000) % 10;
  const zhi = (year - 4 + 10000) % 12;
  return { gan, zhi };
}

function getMonthPillar(date, yearGan) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  let monthZhi;
  for (let i = 11; i >= 0; i--) {
    const [jm, jd] = JIEQI[i];
    if (jm < m || (jm === m && d >= jd)) {
      monthZhi = (i + 2) % 12;
      break;
    }
  }
  if (monthZhi === undefined) monthZhi = 1;
  const yinGan = (yearGan * 2 + 2) % 10;
  const offset = (monthZhi - 2 + 12) % 12;
  const monthGan = (yinGan + offset) % 10;
  return { gan: monthGan, zhi: monthZhi };
}

function getDayPillar(date) {
  const base = new Date(1900, 0, 1);
  const diff = Math.floor((date - base) / 86400000);
  const idx = (10 + diff) % 60;
  return { gan: idx % 10, zhi: idx % 12 };
}

function getHourPillar(hourZhi, dayGan) {
  const ziGan = (dayGan * 2) % 10;
  const hourGan = (ziGan + hourZhi) % 10;
  return { gan: hourGan, zhi: hourZhi };
}

function getMingGong(monthZhi, hourZhi, yearGan) {
  const m = monthZhi + 1;
  const t = hourZhi + 1;
  let mgZhi;
  if (m + t <= 14) mgZhi = 14 - m - t;
  else mgZhi = 26 - m - t;
  if (mgZhi === 0) mgZhi = 12;
  mgZhi = mgZhi - 1;
  const yinGan = (yearGan * 2 + 2) % 10;
  const offset = (mgZhi - 2 + 12) % 12;
  const mgGan = (yinGan + offset) % 10;
  return { gan: mgGan, zhi: mgZhi };
}

function calcBazi(birthDate, birthHour) {
  const date = new Date(birthDate);
  const year = getYearPillar(date);
  const month = getMonthPillar(date, year.gan);
  const day = getDayPillar(date);
  const hour = getHourPillar(birthHour, day.gan);
  const mingGong = getMingGong(month.zhi, birthHour, year.gan);
  return { year, month, day, hour, mingGong };
}

function analyzeWuxing(bazi) {
  const counts = [0, 0, 0, 0, 0];
  const pillars = [bazi.year, bazi.month, bazi.day, bazi.hour, bazi.mingGong];
  for (const p of pillars) {
    counts[GAN_WX[p.gan]]++;
    counts[ZHI_WX[p.zhi]]++;
  }
  return counts;
}

const WX_CONSUME = {
  0: { name: '金', cats: ['医疗','交通','通讯'], organs: '肺、大肠、呼吸道', invest: '金属、机械、金融理财', traits: '果断、重义气' },
  1: { name: '木', cats: ['教育','购物'], organs: '肝、胆、眼睛', invest: '教育、文化、植物、文创', traits: '仁慈、有上进心' },
  2: { name: '水', cats: ['餐饮','娱乐'], organs: '肾、膀胱、泌尿系统', invest: '旅游、流通行业、饮品', traits: '聪明、灵活、善变通' },
  3: { name: '火', cats: ['娱乐','购物'], organs: '心、小肠、血液循环', invest: '电子产品、能源、社交活动', traits: '热情、有礼节' },
  4: { name: '土', cats: ['住房','其他'], organs: '脾、胃、消化系统', invest: '房产、农业、稳定型资产', traits: '诚信、稳重' },
};

/* ===== 八卦数据（后天八卦方位） ===== */
const BAGUA_DATA = [
  { name: '离', element: '火', direction: '南', angle: 0, yao: [1,0,1], cats: ['娱乐','通讯'], meaning: '光明、热情、依附', color: '#FF3366', organ: '心、小肠' },
  { name: '坤', element: '土', direction: '西南', angle: 45, yao: [0,0,0], cats: ['住房'], meaning: '柔顺、包容、承载', color: '#FFAA00', organ: '脾、胃' },
  { name: '兑', element: '金', direction: '西', angle: 90, yao: [0,1,1], cats: ['购物'], meaning: '喜悦、交流、消费', color: '#B8C4D0', organ: '肺、大肠' },
  { name: '乾', element: '金', direction: '西北', angle: 135, yao: [1,1,1], cats: ['医疗'], meaning: '刚健、圆满、天道', color: '#E8E8E8', organ: '头、肺' },
  { name: '坎', element: '水', direction: '北', angle: 180, yao: [0,1,0], cats: ['餐饮'], meaning: '流动、智慧、险陷', color: '#00D4FF', organ: '肾、膀胱' },
  { name: '艮', element: '土', direction: '东北', angle: 225, yao: [1,0,0], cats: ['其他'], meaning: '静止、稳重、停止', color: '#FFAA00', organ: '脾、胃' },
  { name: '震', element: '木', direction: '东', angle: 270, yao: [0,0,1], cats: ['交通'], meaning: '行动、奋发、震动', color: '#00FF88', organ: '肝、胆' },
  { name: '巽', element: '木', direction: '东南', angle: 315, yao: [1,1,0], cats: ['教育'], meaning: '顺入、渗透、灵活', color: '#00FF88', organ: '肝、胆' },
];

function getBaguaConsumption(recs) {
  const data = BAGUA_DATA.map((bg, i) => ({ index: i, name: bg.name, element: bg.element, direction: bg.direction, cats: bg.cats, amount: 0, count: 0 }));
  for (const r of recs) {
    let hit = -1;
    // 1) 优先按分类名精确匹配
    for (let i = 0; i < BAGUA_DATA.length; i++) {
      if (BAGUA_DATA[i].cats.includes(r.category)) { hit = i; break; }
    }
    // 2) 自定义分类未登记在 BAGUA_DATA.cats 中：退回按五行归入对应卦象
    if (hit < 0) {
      const wx = catWuxing(r.category);
      const wxName = WUXING[wx];
      const cands = [];
      for (let i = 0; i < BAGUA_DATA.length; i++) {
        if (BAGUA_DATA[i].element === wxName) cands.push(i);
      }
      if (cands.length > 0) hit = cands[0];   // 同五行多卦时取第一个（与内置映射一致）
    }
    if (hit >= 0) { data[hit].amount += r.amount; data[hit].count++; }
  }
  return data;
}

function renderBagua(svgId, consumptionData, options) {
  const svg = $('#' + svgId);
  if (!svg) return;
  const cx = 200, cy = 200;
  const outerR = 188, innerR = 78;
  const trigramR = 142;
  const yaoW = 34, yaoH = 4.5, yaoGap = 3.5;
  const maxAmount = Math.max(...consumptionData.map(d => d.amount), 1);
  let html = '';

  html += `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
  html += `<circle cx="${cx}" cy="${cy}" r="${outerR - 6}" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`;
  html += `<circle cx="${cx}" cy="${cy}" r="${innerR}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;

  for (let i = 0; i < 8; i++) {
    const bg = BAGUA_DATA[i];
    const data = consumptionData[i];
    const startAngle = (bg.angle - 22.5) * Math.PI / 180;
    const endAngle = (bg.angle + 22.5) * Math.PI / 180;
    const intensity = data.amount / maxAmount;
    const x1 = cx + outerR * Math.sin(startAngle);
    const y1 = cy - outerR * Math.cos(startAngle);
    const x2 = cx + outerR * Math.sin(endAngle);
    const y2 = cy - outerR * Math.cos(endAngle);
    const x3 = cx + innerR * Math.sin(endAngle);
    const y3 = cy - innerR * Math.cos(endAngle);
    const x4 = cx + innerR * Math.sin(startAngle);
    const y4 = cy - innerR * Math.cos(startAngle);
    const opacity = 0.04 + intensity * 0.28;
    html += `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${outerR} ${outerR} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${x3.toFixed(1)} ${y3.toFixed(1)} A ${innerR} ${innerR} 0 0 0 ${x4.toFixed(1)} ${y4.toFixed(1)} Z" fill="${bg.color}" opacity="${opacity.toFixed(3)}" class="bagua-sector" data-index="${i}"/>`;
    if (intensity > 0.5) {
      html += `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${outerR} ${outerR} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${x3.toFixed(1)} ${y3.toFixed(1)} A ${innerR} ${innerR} 0 0 0 ${x4.toFixed(1)} ${y4.toFixed(1)} Z" fill="none" stroke="${bg.color}" stroke-width="1.5" opacity="${(intensity * 0.4).toFixed(3)}"/>`;
    }
  }

  const tR = 48;
  html += `<g class="bagua-taiji-outer">`;
  html += `<circle cx="${cx}" cy="${cy}" r="${tR}" fill="rgba(10,10,14,0.8)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`;
  html += `<path d="M ${cx} ${cy - tR} A ${tR / 2} ${tR / 2} 0 0 1 ${cx} ${cy} A ${tR / 2} ${tR / 2} 0 0 0 ${cx} ${cy - tR} Z" fill="rgba(237,237,239,0.12)"/>`;
  html += `<circle cx="${cx}" cy="${cy - tR / 2}" r="${tR / 7}" fill="rgba(10,10,14,0.6)"/>`;
  html += `<circle cx="${cx}" cy="${cy + tR / 2}" r="${tR / 7}" fill="rgba(237,237,239,0.15)"/>`;
  html += `</g>`;

  for (let i = 0; i < 8; i++) {
    const bg = BAGUA_DATA[i];
    const angleRad = bg.angle * Math.PI / 180;
    const tx = cx + trigramR * Math.sin(angleRad);
    const ty = cy - trigramR * Math.cos(angleRad);
    const data = consumptionData[i];
    const intensity = data.amount / maxAmount;
    const yaoOpacity = 0.5 + intensity * 0.5;

    html += `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) rotate(${bg.angle})">`;
    for (let j = 0; j < 3; j++) {
      const yaoY = (j - 1) * (yaoH + yaoGap);
      if (bg.yao[j] === 1) {
        html += `<rect x="${-yaoW / 2}" y="${(yaoY - yaoH / 2).toFixed(1)}" width="${yaoW}" height="${yaoH}" rx="1" fill="${bg.color}" opacity="${yaoOpacity.toFixed(2)}" class="bagua-yao"/>`;
      } else {
        const gap = yaoW * 0.28;
        const segW = (yaoW - gap) / 2;
        html += `<rect x="${-yaoW / 2}" y="${(yaoY - yaoH / 2).toFixed(1)}" width="${segW}" height="${yaoH}" rx="1" fill="${bg.color}" opacity="${yaoOpacity.toFixed(2)}" class="bagua-yao"/>`;
        html += `<rect x="${gap / 2}" y="${(yaoY - yaoH / 2).toFixed(1)}" width="${segW}" height="${yaoH}" rx="1" fill="${bg.color}" opacity="${yaoOpacity.toFixed(2)}" class="bagua-yao"/>`;
      }
    }
    html += `</g>`;

    const nameR = trigramR + 30;
    const nx = cx + nameR * Math.sin(angleRad);
    const ny = cy - nameR * Math.cos(angleRad);
    const nameOpacity = 0.6 + intensity * 0.4;
    html += `<text x="${nx.toFixed(1)}" y="${ny.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="15" font-weight="700" fill="${bg.color}" opacity="${nameOpacity.toFixed(2)}" class="bagua-name">${bg.name}</text>`;

    const dirR = trigramR - 32;
    const dx = cx + dirR * Math.sin(angleRad);
    const dy = cy - dirR * Math.cos(angleRad);
    html += `<text x="${dx.toFixed(1)}" y="${dy.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="9" fill="rgba(255,255,255,0.25)">${bg.direction}</text>`;

    if (data.amount > 0 && options && options.showAmounts) {
      const amtR = trigramR + 48;
      const ax = cx + amtR * Math.sin(angleRad);
      const ay = cy - amtR * Math.cos(angleRad);
      html += `<text x="${ax.toFixed(1)}" y="${ay.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="10" fill="rgba(255,255,255,0.4)" font-variant-numeric="tabular-nums">${fmtMoneyShort(data.amount)}</text>`;
    }
  }

  svg.innerHTML = html;
}

function renderBaguaLegend(consumptionData, elementId) {
  const el = $('#' + elementId);
  if (!el) return;
  el.innerHTML = consumptionData.map(d => {
    const bg = BAGUA_DATA[d.index];
    return `<div class="bagua-legend-item">
      <span class="bagua-legend-name" style="color:${bg.color}">${bg.name}</span>
      <span class="bagua-legend-cat">${bg.cats.join('/')}</span>
      <span class="bagua-legend-amt">${fmtMoneyShort(d.amount)}</span>
    </div>`;
  }).join('');
}

function renderBaguaInterpretation(baziData, consumptionData) {
  const el = $('#baguaInterpretation');
  if (!el) return;
  const { wuxing, bazi } = baziData;
  const total = consumptionData.reduce((s, d) => s + d.amount, 0);
  let html = '';

  if (total === 0) {
    el.innerHTML = '<div class="interp-item">暂无消费数据。记录消费后，将根据你的八字命理分析各卦象方位的消费吉凶。</div>';
    return;
  }

  const sorted = [...consumptionData].sort((a, b) => b.amount - a.amount);
  const top = sorted[0];
  const topBg = BAGUA_DATA[top.index];
  const topPct = (top.amount / total * 100).toFixed(1);
  const topElementIdx = WUXING.indexOf(topBg.element);
  const elementStrength = wuxing[topElementIdx];

  html += `<div class="interp-item"><span class="interp-gua" style="color:${topBg.color}">${topBg.name}卦</span>主导消费（${topPct}%），对应<strong>${topBg.cats.join('、')}</strong>。${topBg.name}卦属<strong>${topBg.element}</strong>，你八字${topBg.element}${elementStrength === 0 ? '缺' : elementStrength >= 4 ? '旺' : '有' + elementStrength + '个'}。`;
  if (elementStrength >= 4) {
    html += `${topBg.element}旺又消费多，需防${topBg.organ}过盛，建议适度分散。`;
  } else if (elementStrength === 0) {
    html += `虽缺${topBg.element}但消费补之，是为吉象。`;
  } else {
    html += `消费与命局较为和谐。`;
  }
  html += `</div>`;

  for (let i = 0; i < 5; i++) {
    if (wuxing[i] === 0) {
      const missingElement = WUXING[i];
      for (let j = 0; j < BAGUA_DATA.length; j++) {
        if (BAGUA_DATA[j].element === missingElement && consumptionData[j].amount === 0) {
          const bg = BAGUA_DATA[j];
          html += `<div class="interp-item"><span class="interp-gua" style="color:${bg.color}">${bg.name}卦</span>空亡 — 八字缺<strong>${missingElement}</strong>且${bg.name}卦（${bg.direction}方）无消费。宜在<strong>${bg.cats.join('、')}</strong>方面投入以补${missingElement}运。</div>`;
        }
      }
    }
  }

  const mgWx = GAN_WX[bazi.mingGong.gan];
  const mgElement = WUXING[mgWx];
  const mgTrigramIndices = [];
  for (let i = 0; i < BAGUA_DATA.length; i++) {
    if (BAGUA_DATA[i].element === mgElement) mgTrigramIndices.push(i);
  }
  const mgConsumption = mgTrigramIndices.reduce((s, i) => s + consumptionData[i].amount, 0);
  if (mgConsumption > 0) {
    const mgPct = (mgConsumption / total * 100).toFixed(1);
    html += `<div class="interp-item">命宫属<strong>${mgElement}</strong>命，${mgElement}卦象（${mgTrigramIndices.map(i => BAGUA_DATA[i].name).join('、')}）消费占${mgPct}%。`;
    if (mgPct > 40) {
      html += `消费与命宫高度相合，运势顺畅，但需防${mgElement}过旺。`;
    } else if (mgPct < 15) {
      html += `命宫方位消费偏少，可适当增加相关投入以旺命宫。`;
    } else {
      html += `消费与命宫较为平衡。`;
    }
    html += `</div>`;
  }

  el.innerHTML = html;
}

function generateBaguaAdvices(baziData) {
  const advices = [];
  if (!baziData) return advices;
  const { wuxing, bazi } = baziData;
  const monthRecs = getMonthRecords(new Date().getFullYear(), new Date().getMonth());
  const baguaConsumption = getBaguaConsumption(monthRecs);
  const total = baguaConsumption.reduce((s, d) => s + d.amount, 0);
  if (total === 0) return advices;

  const sorted = [...baguaConsumption].sort((a, b) => b.amount - a.amount);
  const dominant = sorted[0];
  const dominantBg = BAGUA_DATA[dominant.index];
  const dominantPct = dominant.amount / total * 100;
  const domElementIdx = WUXING.indexOf(dominantBg.element);

  if (dominantPct > 35) {
    if (wuxing[domElementIdx] >= 4) {
      advices.push({
        type: 'destiny', icon: '☯️',
        title: `${dominantBg.name}卦主导 — ${dominantBg.element}旺消费集中`,
        desc: `消费集中于<strong>${dominantBg.name}卦</strong>（${dominantBg.direction}方·${dominantBg.element}），占${dominantPct.toFixed(0)}%（${fmtMoney(dominant.amount)}），对应${dominantBg.cats.join('、')}。你八字${dominantBg.element}旺（${wuxing[domElementIdx]}个），${dominantBg.element}旺加${dominantBg.element}消费多，易致${dominantBg.organ}偏盛。建议将部分消费转移到其他卦象方位以平衡命局。`,
        action: `尝试增加其他方位的消费`,
      });
    } else if (wuxing[domElementIdx] === 0) {
      advices.push({
        type: 'destiny', icon: '✨',
        title: `${dominantBg.name}卦补缺 — 消费补${dominantBg.element}运`,
        desc: `消费集中于<strong>${dominantBg.name}卦</strong>（${dominantBg.direction}方·${dominantBg.element}），占${dominantPct.toFixed(0)}%。你八字缺${dominantBg.element}，消费正好补${dominantBg.element}运，是为吉象。保持当前消费方向有助于平衡命局。`,
      });
    }
  }

  for (let i = 0; i < 5; i++) {
    if (wuxing[i] === 0) {
      const missingElement = WUXING[i];
      for (let j = 0; j < BAGUA_DATA.length; j++) {
        if (BAGUA_DATA[j].element === missingElement && baguaConsumption[j].amount === 0) {
          const bg = BAGUA_DATA[j];
          advices.push({
            type: 'destiny', icon: '🔮',
            title: `${bg.name}卦空亡 — 宜补${missingElement}运`,
            desc: `八字缺<strong>${missingElement}</strong>，且<strong>${bg.name}卦</strong>（${bg.direction}方·${bg.cats.join('、')}）消费为零。${bg.name}卦主${bg.meaning}，建议在${bg.cats.join('、')}方面适当投入以补${missingElement}运，关注${bg.organ}健康。`,
            action: `安排一些${bg.cats.join('、')}支出`,
          });
        }
      }
    }
  }

  const mgWx = GAN_WX[bazi.mingGong.gan];
  const mgElement = WUXING[mgWx];
  const mgTrigramIndices = [];
  for (let i = 0; i < BAGUA_DATA.length; i++) {
    if (BAGUA_DATA[i].element === mgElement) mgTrigramIndices.push(i);
  }
  const mgConsumption = mgTrigramIndices.reduce((s, i) => s + baguaConsumption[i].amount, 0);
  if (mgConsumption > 0 && total > 0) {
    const mgPct = mgConsumption / total * 100;
    const mgNames = mgTrigramIndices.map(i => BAGUA_DATA[i].name).join('、');
    if (mgPct > 45) {
      advices.push({
        type: 'destiny', icon: '🏯',
        title: `命宫${mgElement}命 — 消费高度合命`,
        desc: `命宫属<strong>${mgElement}</strong>，${mgElement}卦象（${mgNames}）消费占${mgPct.toFixed(0)}%。消费与命宫高度相合，运势顺畅。但${mgElement}过旺则反受其累，建议保持适度，关注${WX_CONSUME[mgWx].organs}保养。`,
      });
    } else if (mgPct < 15) {
      advices.push({
        type: 'destiny', icon: '🏛️',
        title: `命宫${mgElement}命 — 消费离命宫偏远`,
        desc: `命宫属<strong>${mgElement}</strong>，但${mgElement}卦象（${mgNames}）消费仅占${mgPct.toFixed(0)}%。可适当增加${mgTrigramIndices.map(i => BAGUA_DATA[i].cats.join('、')).join('、')}投入以旺命宫，提升整体运势。`,
      });
    }
  }

  const activeTrigrams = baguaConsumption.filter(d => d.amount > 0).length;
  if (activeTrigrams >= 6) {
    advices.push({
      type: 'destiny', icon: '🌟',
      title: `八卦流通 — 消费方位全面`,
      desc: `消费分布在${activeTrigrams}个卦象方位，八卦流通性好。从命理角度看，消费方位全面意味着五行兼顾，有助于命局平衡。继续保持多元化的消费结构。`,
    });
  } else if (activeTrigrams <= 2 && total > 500) {
    advices.push({
      type: 'destiny', icon: '⚠️',
      title: `卦象偏枯 — 消费方位过窄`,
      desc: `消费仅集中在${activeTrigrams}个卦象方位，八卦偏枯。建议拓展消费方位，激活更多卦象能量，有助于改善运势流通。`,
    });
  }

  return advices;
}

function renderBaziResult(bazi, wuxing, gender) {
  const pillars = [
    { label: '年柱', p: bazi.year },
    { label: '月柱', p: bazi.month },
    { label: '日柱', p: bazi.day },
    { label: '时柱', p: bazi.hour },
  ];

  $('#baziDisplay').innerHTML = pillars.map(({ label, p }) => {
    const ganWx = WUXING_KEY[GAN_WX[p.gan]];
    const zhiWx = WUXING_KEY[ZHI_WX[p.zhi]];
    return `<div class="bazi-pillar">
      <div class="bazi-pillar-label">${label}</div>
      <div class="bazi-gan wuxing-${ganWx}">${TIANGAN[p.gan]}</div>
      <div class="bazi-zhi wuxing-${zhiWx}">${DIZHI[p.zhi]}</div>
    </div>`;
  }).join('');

  const mgWx = WUXING_KEY[GAN_WX[bazi.mingGong.gan]];
  $('#minggongDisplay').innerHTML = `
    <span class="minggong-label">命宫</span>
    <span class="minggong-value wuxing-${mgWx}" style="color:${['#A8A8A8','#34C759','#5AC8FA','#FF3B30','#FF9500'][GAN_WX[bazi.mingGong.gan]]}">${TIANGAN[bazi.mingGong.gan]}${DIZHI[bazi.mingGong.zhi]}</span>
    <span class="minggong-label">${gender === 'male' ? '乾造' : '坤造'} · ${WX_CONSUME[GAN_WX[bazi.mingGong.gan]].name}命</span>
  `;

  const maxCount = Math.max(...wuxing);
  $('#wuxingChart').innerHTML = wuxing.map((c, i) => {
    const h = maxCount > 0 ? (c / maxCount * 100) : 0;
    return `<div class="wuxing-bar-item">
      <div class="wuxing-bar-track">
        <div class="wuxing-bar-fill wx-${WUXING_KEY[i]}" style="height:${h}%"></div>
      </div>
      <div class="wuxing-bar-name">${WUXING[i]}</div>
      <div class="wuxing-bar-count">${c}</div>
    </div>`;
  }).join('');

  const total = wuxing.reduce((s, c) => s + c, 0);
  const missing = wuxing.map((c, i) => c === 0 ? i : -1).filter(i => i >= 0);
  const strong = wuxing.map((c, i) => c >= 4 ? i : -1).filter(i => i >= 0);
  const weak = wuxing.map((c, i) => c >= 1 && c <= 2 ? i : -1).filter(i => i >= 0);

  let summary = '<div>五行分布：';
  wuxing.forEach((c, i) => {
    summary += `<span class="wuxing-tag wx-${WUXING_KEY[i]}">${WUXING[i]} ${c}</span>`;
  });
  summary += `（共 ${total}）</div>`;

  if (missing.length > 0) {
    summary += `<div style="margin-top:8px">缺：${missing.map(i => `<span class="wuxing-tag wx-${WUXING_KEY[i]}">${WUXING[i]}</span>`).join('')}</div>`;
  }
  if (strong.length > 0) {
    summary += `<div style="margin-top:4px">旺：${strong.map(i => `<span class="wuxing-tag wx-${WUXING_KEY[i]}">${WUXING[i]}</span>`).join('')}</div>`;
  }
  if (missing.length === 0 && strong.length === 0) {
    summary += `<div style="margin-top:8px">五行较为均衡，无缺失无过旺</div>`;
  }
  $('#wuxingSummary').innerHTML = summary;

  const monthRecs = getMonthRecords(new Date().getFullYear(), new Date().getMonth());
  const baguaConsumption = getBaguaConsumption(monthRecs);
  renderBagua('baguaPersonalSvg', baguaConsumption, { showAmounts: false });
  renderBaguaInterpretation({ bazi, wuxing, gender }, baguaConsumption);
}

function generateDestinyAdvices(wuxing, bazi) {
  const advices = [];
  const missing = wuxing.map((c, i) => c === 0 ? i : -1).filter(i => i >= 0);
  const strong = wuxing.map((c, i) => c >= 4 ? i : -1).filter(i => i >= 0);
  const weak = wuxing.map((c, i) => c >= 1 && c <= 2 ? i : -1).filter(i => i >= 0);
  const sorted = wuxing.map((c, i) => ({ i, c })).sort((a, b) => b.c - a.c);
  const maxWx = sorted[0];
  const minWx = sorted[sorted.length - 1];

  if (missing.length > 0) {
    for (const i of missing) {
      const wx = WX_CONSUME[i];
      advices.push({
        type: 'destiny', icon: '🔮',
        title: `五行缺${wx.name} — 宜补${wx.name}运`,
        desc: `你的八字五行缺<strong>${wx.name}</strong>（${wx.organs}）。建议在<strong>${wx.cats.join('、')}</strong>方面适当增加投入，如${wx.invest}。补${wx.name}运有助于平衡命局，提升整体运势。`,
        action: `多关注 ${wx.cats.join('、')} 相关消费`,
      });
    }
  }

  if (strong.length > 0) {
    for (const i of strong) {
      const wx = WX_CONSUME[i];
      advices.push({
        type: 'destiny', icon: '⚖️',
        title: `${wx.name}旺 — 宜节制${wx.name}相关支出`,
        desc: `你的八字<strong>${wx.name}</strong>旺（${wuxing[i]}个）。${wx.name}旺者${wx.traits}，但${wx.name}过旺易致${wx.organs}偏盛。建议控制<strong>${wx.cats.join('、')}</strong>方面的过度消费，保持身心平衡。`,
        action: `适度控制 ${wx.cats.join('、')} 支出`,
      });
    }
  }

  if (missing.length === 0 && strong.length === 0 && weak.length > 0) {
    const weakest = weak.sort((a, b) => wuxing[a] - wuxing[b])[0];
    const wx = WX_CONSUME[weakest];
    advices.push({
      type: 'destiny', icon: '🌱',
      title: `${wx.name}偏弱 — 宜养${wx.name}`,
      desc: `五行中<strong>${wx.name}</strong>偏弱（仅${wuxing[weakest]}个）。建议在<strong>${wx.cats.join('、')}</strong>方面适当投入以养${wx.name}运，关注${wx.organs}的健康保养。`,
      action: `适当增加 ${wx.cats.join('、')} 投入`,
    });
  }

  const monthRecs = getMonthRecords(new Date().getFullYear(), new Date().getMonth());
  if (monthRecs.length > 0) {
    const monthTotal = monthRecs.reduce((s, r) => s + r.amount, 0);
    const catStats = getCategoryStats(monthRecs);

    for (const i of missing) {
      const wx = WX_CONSUME[i];
      const relevantCats = catStats.filter(s => wx.cats.includes(s.name));
      if (relevantCats.length === 0) {
        const pct = 0;
        advices.push({
          type: 'destiny', icon: '📊',
          title: `消费缺${wx.name} — 本月无${wx.name}相关支出`,
          desc: `本月尚未在${wx.name}相关类别（${wx.cats.join('、')}）上有任何消费。从命理角度看，适当投入有助于补运。建议本月安排一些${wx.invest}方面的支出。`,
        });
      }
    }

    for (const i of strong) {
      const wx = WX_CONSUME[i];
      const relevantCats = catStats.filter(s => wx.cats.includes(s.name));
      if (relevantCats.length > 0) {
        const relevantTotal = relevantCats.reduce((s, c) => s + c.amount, 0);
        const pct = relevantTotal / monthTotal * 100;
        if (pct > 30) {
          advices.push({
            type: 'destiny', icon: '⚠️',
            title: `${wx.name}旺且消费集中 — 需注意平衡`,
            desc: `你${wx.name}旺，本月${wx.name}相关消费（${relevantCats.map(c=>c.name).join('、')}）占${pct.toFixed(0)}%（${fmtMoney(relevantTotal)}）。${wx.name}旺加${wx.name}消费多，易致${wx.organs}负担。建议分散消费到其他类别。`,
            action: '尝试调整消费结构',
          });
        }
      }
    }
  }

  if (missing.length === 0 && strong.length === 0) {
    advices.push({
      type: 'destiny', icon: '🌟',
      title: '五行流通 — 消费宜随缘布施',
      desc: `你的八字五行较为均衡（${wuxing.map((c,i)=>WUXING[i]+c).join(' ')}），命局流通。消费上无需刻意补缺或抑旺，顺其自然即可。可适当在慈善、教育方面布施，积善纳福。`,
    });
  }

  const mgWx = GAN_WX[bazi.mingGong.gan];
  const mgInfo = WX_CONSUME[mgWx];
  advices.push({
    type: 'destiny', icon: '🏯',
    title: `命宫${TIANGAN[bazi.mingGong.gan]}${DIZHI[bazi.mingGong.zhi]} — ${mgInfo.name}命之人`,
    desc: `命宫为${mgInfo.name}命，性${mgInfo.traits}。理财上宜${mgWx === 4 ? '稳健保守、注重积蓄' : mgWx === 2 ? '灵活多变、多元投资' : mgWx === 3 ? '热情投入但需防冲动消费' : mgWx === 1 ? '循序渐进、注重成长型投入' : '果断决策、重品质而非数量'}。关注${mgInfo.organs}的健康保养。`,
  });

  return advices;
}

function calcAndShowBazi() {
  const birthDate = $('#birthDate').value;
  const birthHour = parseInt($('#birthHour').value);
  if (!birthDate) { toast('请输入出生日期'); return; }

  const gender = state.selectedGender || 'male';
  const bazi = calcBazi(birthDate, birthHour);
  const wuxing = analyzeWuxing(bazi);

  state.baziData = { bazi, wuxing, gender, birthDate, birthHour };
  localStorage.setItem('bazi_data', JSON.stringify(state.baziData));

  $('#destinyInputArea').style.display = 'none';
  $('#destinyResult').style.display = 'block';
  renderBaziResult(bazi, wuxing, gender);
  renderDailyFortune(state.baziData);
  renderAdvice();
  toast('八字排盘完成');
}

function resetBazi() {
  state.baziData = null;
  localStorage.removeItem('bazi_data');
  $('#destinyInputArea').style.display = 'block';
  $('#destinyResult').style.display = 'none';
  $('#dailyFortuneCard').style.display = 'none';
  renderAdvice();
}

/* ===== 3D 圆柱体分类选择器 ===== */
/* 分类数量可变（支持自定义分类），几何参数改为按当前分类数动态计算 */
function cylCount() { return CATEGORIES.length; }
function cylAngle() { return 360 / cylCount(); }
function cylRadius() {
  const n = cylCount();
  if (n < 2) return 0;
  // 面板宽 80px，按内接多边形估算半径；最少 90px 保证不重叠
  return Math.max(90, Math.round(80 / (2 * Math.tan(Math.PI / n))));
}
let cylRotation = 0;
let cylDragging = false;
let cylStartX = 0;
let cylStartRot = 0;
let cylEventsBound = false;

/* 重建圆柱体面板（新增/删除分类后调用） */
function rebuildCylinder() {
  const stage = $('#cylinderStage');
  if (!stage) return;
  const n = cylCount();
  const angleStep = cylAngle();
  const radius = cylRadius();
  // 保持当前选中分类不变（若仍存在）
  const prevName = state.selectedCategory;
  let idx = CATEGORIES.findIndex(c => c.name === prevName);
  if (idx < 0) idx = 0;
  cylRotation = -idx * angleStep;

  let html = '';
  for (let i = 0; i < n; i++) {
    const cat = CATEGORIES[i];
    const angle = i * angleStep;
    html += `<div class="cylinder-panel${i === idx ? ' active' : ''}" data-index="${i}" style="transform: rotateY(${angle}deg) translateZ(${radius}px)">
      <span class="cylinder-panel-icon">${cat.icon}</span>
      <span class="cylinder-panel-name">${cat.name}</span>
    </div>`;
  }
  stage.innerHTML = html;

  // 面板重建后需重新绑定点击（事件委托到 stage，只需绑一次）
  if (!cylEventsBound) {
    stage.addEventListener('click', (e) => {
      const panel = e.target.closest('.cylinder-panel');
      if (!panel || cylDragging) return;
      const i = parseInt(panel.dataset.index);
      if (!Number.isInteger(i)) return;
      cylRotation = -i * cylAngle();
      updateCylinderRotation();
    });
    cylEventsBound = true;
  }
  updateCylinderRotation();
}

function initCylinder() {
  const stage = $('#cylinderStage');
  rebuildCylinder();

  stage.addEventListener('mousedown', cylMouseDown);
  stage.addEventListener('touchstart', cylTouchStart, { passive: true });
  document.addEventListener('mousemove', cylMouseMove);
  document.addEventListener('mouseup', cylMouseUp);
  document.addEventListener('touchmove', cylTouchMove, { passive: false });
  document.addEventListener('touchend', cylTouchEnd);
}

function cylMouseDown(e) { cylDragging = true; cylStartX = e.clientX; cylStartRot = cylRotation; $('#cylinderStage').classList.add('dragging'); }
function cylTouchStart(e) { if (e.touches.length === 1) { cylDragging = true; cylStartX = e.touches[0].clientX; cylStartRot = cylRotation; $('#cylinderStage').classList.add('dragging'); } }
function cylMouseMove(e) { if (!cylDragging) return; cylRotation = cylStartRot + (e.clientX - cylStartX) * 0.8; updateCylinderRotation(); }
function cylTouchMove(e) { if (!cylDragging) return; e.preventDefault(); cylRotation = cylStartRot + (e.touches[0].clientX - cylStartX) * 0.8; updateCylinderRotation(); }
function cylMouseUp() { if (!cylDragging) return; cylDragging = false; $('#cylinderStage').classList.remove('dragging'); snapCylinder(); }
function cylTouchEnd() { if (!cylDragging) return; cylDragging = false; $('#cylinderStage').classList.remove('dragging'); snapCylinder(); }

function snapCylinder() {
  const step = cylAngle();
  const nearest = Math.round(cylRotation / step) * step;
  cylRotation = nearest;
  updateCylinderRotation();
}

function updateCylinderRotation() {
  const stage = $('#cylinderStage');
  if (!stage) return;
  const n = cylCount();
  const step = cylAngle();
  stage.style.transform = `rotateY(${cylRotation}deg)`;
  const activeIdx = ((-Math.round(cylRotation / step) % n) + n) % n;
  stage.querySelectorAll('.cylinder-panel').forEach((p, i) => {
    p.classList.toggle('active', i === activeIdx);
  });
  const cat = CATEGORIES[activeIdx];
  if (!cat) return;
  const currentEl = $('#cylinderCurrent');
  if (currentEl) {
    currentEl.textContent = cat.name;
    currentEl.style.color = cat.color;
  }
  state.selectedCategory = cat.name;
}

/* ===== 大运流年计算 ===== */
function calcStartAge(birthDate, forward) {
  const birth = new Date(birthDate);
  const year = birth.getFullYear();
  const jieqiDates = [];
  for (let y = year - 1; y <= year + 1; y++) {
    for (let i = 0; i < 12; i++) {
      const [m, d] = JIEQI[i];
      jieqiDates.push(new Date(y, m - 1, d));
    }
  }
  jieqiDates.sort((a, b) => a - b);
  let target;
  if (forward) {
    target = jieqiDates.find(d => d > birth);
  } else {
    target = [...jieqiDates].reverse().find(d => d < birth);
  }
  if (!target) return 1;
  const diffDays = Math.abs(target - birth) / 86400000;
  return Math.max(1, Math.round(diffDays / 3 * 10) / 10);
}

function calcDayun(bazi, gender, birthDate) {
  const yearGan = bazi.year.gan;
  const isYangYear = yearGan % 2 === 0;
  const isMale = gender === 'male';
  const forward = (isYangYear && isMale) || (!isYangYear && !isMale);
  const startAge = calcStartAge(birthDate, forward);
  const dayun = [];
  let gan = bazi.month.gan;
  let zhi = bazi.month.zhi;
  for (let i = 0; i < 8; i++) {
    if (forward) { gan = (gan + 1) % 10; zhi = (zhi + 1) % 12; }
    else { gan = (gan - 1 + 10) % 10; zhi = (zhi - 1 + 12) % 12; }
    dayun.push({ gan, zhi, startAge: startAge + i * 10, endAge: startAge + (i + 1) * 10 });
  }
  return { dayun, forward, startAge };
}

function getCurrentDayun(dayunData, birthDate) {
  const birth = new Date(birthDate);
  const now = new Date();
  const age = (now - birth) / (365.25 * 86400000);
  const { dayun } = dayunData;
  for (const dy of dayun) {
    if (age >= dy.startAge && age < dy.endAge) return dy;
  }
  return dayun[dayun.length - 1];
}

/* ===== 今日宜购 ===== */
/* 分类五行：统一从分类对象读取，自定义分类的 wx 由用户指定或系统猜测 */
function catWuxing(name) {
  const c = CAT_MAP[name];
  return c && Number.isInteger(c.wx) ? c.wx : 4;
}
const SHENG_WO = [4, 2, 0, 1, 3];
const WO_KE = [1, 4, 3, 0, 2];
const KE_WO = [3, 0, 4, 2, 1];
const WX_COLORS = ['#B8C4D0', '#00FF88', '#00D4FF', '#FF3366', '#FFAA00'];

function renderDailyFortune(baziData) {
  const card = $('#dailyFortuneCard');
  const content = $('#dailyFortuneContent');
  if (!baziData || !baziData.birthDate) { card.style.display = 'none'; return; }

  const { bazi, gender, birthDate } = baziData;
  const today = new Date();
  const todayDay = getDayPillar(today);
  const todayYear = getYearPillar(today);
  const todayMonth = getMonthPillar(today, todayYear.gan);
  const dayunData = calcDayun(bazi, gender, birthDate);
  const currentDy = getCurrentDayun(dayunData, birthDate);

  const dayGanWx = GAN_WX[todayDay.gan];
  const dyWx = GAN_WX[currentDy.gan];
  const liunianWx = GAN_WX[todayYear.gan];

  const favorWx = [dayGanWx, SHENG_WO[dayGanWx]];
  const avoidWx = [WO_KE[dayGanWx], KE_WO[dayGanWx]];

  let favorCats = CATEGORIES.filter(c => favorWx.includes(catWuxing(c.name)));
  let avoidCats = CATEGORIES.filter(c => avoidWx.includes(catWuxing(c.name)));

  const dyBoosts = favorWx.includes(dyWx);
  const dyHinders = avoidWx.includes(dyWx);
  const lnBoosts = favorWx.includes(liunianWx);
  const lnHinders = avoidWx.includes(liunianWx);

  const wxName = WUXING[dayGanWx];
  const dyWxName = WUXING[dyWx];
  const lnWxName = WUXING[liunianWx];

  let html = '';

  html += `<div class="dfortune-header">`;
  html += `<div class="dfortune-pillar"><span class="dfortune-pillar-label">今日</span><span class="dfortune-pillar-value wuxing-${WUXING_KEY[dayGanWx]}" style="color:${WX_COLORS[dayGanWx]}">${TIANGAN[todayDay.gan]}${DIZHI[todayDay.zhi]}</span></div>`;
  html += `<div class="dfortune-pillar"><span class="dfortune-pillar-label">流年</span><span class="dfortune-pillar-value wuxing-${WUXING_KEY[liunianWx]}" style="color:${WX_COLORS[liunianWx]}">${TIANGAN[todayYear.gan]}${DIZHI[todayYear.zhi]}</span></div>`;
  html += `<div class="dfortune-pillar"><span class="dfortune-pillar-label">大运</span><span class="dfortune-pillar-value wuxing-${WUXING_KEY[dyWx]}" style="color:${WX_COLORS[dyWx]}">${TIANGAN[currentDy.gan]}${DIZHI[currentDy.zhi]}</span></div>`;
  html += `<div class="dfortune-pillar"><span class="dfortune-pillar-label">起运</span><span class="dfortune-pillar-value">${dayunData.startAge}岁</span></div>`;
  html += `</div>`;

  html += `<div class="dfortune-wx-row">`;
  html += `<span class="dfortune-wx-tag wx-${WUXING_KEY[dayGanWx]}" style="background:${WX_COLORS[dayGanWx]}22;color:${WX_COLORS[dayGanWx]}">日干${wxName}</span>`;
  html += `<span class="dfortune-wx-tag wx-${WUXING_KEY[dyWx]}" style="background:${WX_COLORS[dyWx]}22;color:${WX_COLORS[dyWx]}">大运${dyWxName}</span>`;
  html += `<span class="dfortune-wx-tag wx-${WUXING_KEY[liunianWx]}" style="background:${WX_COLORS[liunianWx]}22;color:${WX_COLORS[liunianWx]}">流年${lnWxName}</span>`;
  html += `</div>`;

  html += `<div class="dfortune-grid">`;
  html += `<div class="dfortune-section"><div class="dfortune-section-title">✅ 今日宜购</div><div class="dfortune-cat-list">`;
  favorCats.forEach(c => {
    html += `<span class="dfortune-cat-tag favor">${c.icon} ${c.name}</span>`;
  });
  html += `</div></div>`;
  html += `<div class="dfortune-section"><div class="dfortune-section-title">⚠️ 今日忌购</div><div class="dfortune-cat-list">`;
  avoidCats.forEach(c => {
    html += `<span class="dfortune-cat-tag avoid">${c.icon} ${c.name}</span>`;
  });
  html += `</div></div>`;
  html += `</div>`;

  html += `<div class="dfortune-desc">`;
  html += `今日日柱<strong>${TIANGAN[todayDay.gan]}${DIZHI[todayDay.zhi]}</strong>，日干属<strong style="color:${WX_COLORS[dayGanWx]}">${wxName}</strong>。`;
  html += `按五行相生原理，<strong>${wxName}</strong>日宜购<strong style="color:${WX_COLORS[dayGanWx]}">${wxName}</strong>属性与<strong style="color:${WX_COLORS[SHENG_WO[dayGanWx]]}">${WUXING[SHENG_WO[dayGanWx]]}</strong>属性（生我者）物品，忌购<strong style="color:${WX_COLORS[WO_KE[dayGanWx]]}">${WUXING[WO_KE[dayGanWx]]}</strong>属性与<strong style="color:${WX_COLORS[KE_WO[dayGanWx]]}">${WUXING[KE_WO[dayGanWx]]}</strong>属性（克我者）物品。`;

  if (dyBoosts) html += ` 当前大运属<strong style="color:${WX_COLORS[dyWx]}">${dyWxName}</strong>，与日干相生，宜购更顺。`;
  if (dyHinders) html += ` ⚠️大运属<strong style="color:${WX_COLORS[dyWx]}">${dyWxName}</strong>克日干，今日消费需谨慎。`;
  if (lnBoosts) html += ` 流年<strong style="color:${WX_COLORS[liunianWx]}">${lnWxName}</strong>相生，整体运势加分。`;
  if (lnHinders) html += ` ⚠️流年<strong style="color:${WX_COLORS[liunianWx]}">${lnWxName}</strong>相克，大额消费宜缓。`;
  html += `</div>`;

  content.innerHTML = html;
  card.style.display = 'block';
}

/* ===== 初始化 ===== */
function init() {
  loadData();
  loadCustomCategories();   // 恢复自定义分类（须在渲染任何分类 UI 之前）

  // 日期显示
  const now = new Date();
  const weekdays = ['日','一','二','三','四','五','六'];
  $('#navDate').textContent = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 · 周${weekdays[now.getDay()]}`;

  // 默认日期
  $('#date').value = todayStr();

  // Tab 切换
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // 3D 圆柱体分类选择
  initCylinder();

  // 表单提交
  $('#recordForm').addEventListener('submit', addRecord);

  // 过滤器（时间维度）—— 限定在消费记录卡片的筛选组内，避免与月度对比切换串台
  $$('.list-card .list-filter .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.list-card .list-filter .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.filter = btn.dataset.filter;
      renderAdvFilter();      // chips 上的计数随时间段变化
      renderRecordList();
    });
  });

  // 高级筛选：折叠开关
  $('#advFilterToggle').addEventListener('click', () => {
    $('.adv-filter').classList.toggle('collapsed');
  });

  // 高级筛选：消费类型 chips（事件委托，chips 会被重绘）
  $('#typeFilterChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.adv-chip');
    if (chip && chip.dataset.type) toggleTypeFilter(chip.dataset.type);
  });

  // 高级筛选：金额区间 chips（事件委托）
  $('#amountFilterChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.adv-chip');
    if (chip && chip.dataset.bucket) toggleAmountBucket(chip.dataset.bucket);
  });

  // 高级筛选：自定义金额区间
  $('#amountApplyBtn').addEventListener('click', applyAmountRange);
  ['#amountMin', '#amountMax'].forEach(sel => {
    $(sel).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); applyAmountRange(); }
    });
  });
  $('#advFilterReset').addEventListener('click', resetAdvFilter);

  // 初始渲染筛选区
  renderAdvFilter();

  // ===== 分类管理 =====
  renderCatPickLists();
  renderCustomCatList();

  $('#catManageToggle').addEventListener('click', () => {
    const panel = $('#catManagePanel');
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'block';
    $('#catManageToggle').textContent = open ? '＋ 新建 / 管理分类' : '收起分类管理';
  });

  // 名称输入 → 自动推荐五行
  $('#newCatName').addEventListener('input', updateWxHint);
  $('#newCatName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); }
  });

  // 图标 / 颜色 / 五行 选择（事件委托）
  $('#newCatIcons').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-icon]');
    if (!btn) return;
    newCatIcon = btn.dataset.icon;
    renderCatPickLists();
  });
  $('#newCatColors').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-color]');
    if (!btn) return;
    newCatColor = btn.dataset.color;
    renderCatPickLists();
  });
  $('#newCatWuxing').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wx]');
    if (!btn) return;
    newCatWx = parseInt(btn.dataset.wx);
    newCatWxTouched = true;
    renderCatPickLists();
    updateWxHint();
  });
  $('#addCatBtn').addEventListener('click', handleAddCategory);

  // 删除自定义分类（事件委托）
  $('#customCatList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del-cat]');
    if (btn) handleDeleteCategory(btn.dataset.delCat);
  });

  // ===== 确认弹窗事件 =====
  $('#confirmOk').addEventListener('click', () => closeConfirm(true));
  $('#confirmCancel').addEventListener('click', () => closeConfirm(false));
  $('#confirmModal').addEventListener('click', (e) => {
    // 点击遮罩空白处取消；点击弹窗内部不关闭
    if (e.target === $('#confirmModal')) closeConfirm(false);
  });

  // ===== 月度对比区间切换 =====
  $$('#monthRangeFilter .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#monthRangeFilter .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      monthRange = parseInt(btn.dataset.months) || 6;
      renderMonthCompare();
    });
  });

  // 预算设置
  $('#budgetSetBtn').addEventListener('click', setBudget);
  $('#budgetInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); setBudget(); }
  });

  // 性别选择
  state.selectedGender = 'male';
  $$('.gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.gender-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedGender = btn.dataset.gender;
    });
  });

  // 八字排盘
  $('#calcBaziBtn').addEventListener('click', calcAndShowBazi);
  $('#resetBaziBtn').addEventListener('click', resetBazi);

  // 加载已保存的八字数据
  try {
    const saved = JSON.parse(localStorage.getItem('bazi_data'));
    if (saved) {
      state.baziData = saved;
      $('#destinyInputArea').style.display = 'none';
      $('#destinyResult').style.display = 'block';
      renderBaziResult(saved.bazi, saved.wuxing, saved.gender);
      renderDailyFortune(saved);
    }
  } catch {}

  // 初始渲染
  renderTodayCard();
  renderRecordList();

  // 首次访问无数据时，提示
  if (state.records.length === 0) {
    setTimeout(() => toast('欢迎使用记账应用，开始记录第一笔吧'), 500);
  }
}

document.addEventListener('DOMContentLoaded', init);