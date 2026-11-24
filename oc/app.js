/* 角色档案馆 - 前端逻辑 */

const app = document.getElementById('app');

const state = {
  admin: false,
  characters: [],
  currentChar: null,
  adminEditing: null, // 正在编辑的角色对象
  graphData: null,
  inferResult: [],
  inferredPreview: [],
  customKinds: [],
};

let network = null;
let nodesDS = null;
let edgesDS = null;
let graphTimer = null;

/* ---------- 基础工具 ---------- */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtDate(s) {
  if (!s) return '';
  return s.replace('T', ' ').slice(0, 16);
}

function initial(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

function avatarHtml(c, size = 52) {
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;background:${esc(c.color || '#7c6cf0')}`;
  if (c.avatar) return `<img class="avatar" src="${esc(c.avatar)}" alt="${esc(c.name)}" style="${style}">`;
  return `<span class="avatar" style="${style}">${esc(initial(c.name))}</span>`;
}

function tagsHtml(tags) {
  return (tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
}

function showToast(msg, type = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal">${html}</div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) root.innerHTML = '';
  });
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function openLightbox(src) {
  const root = document.getElementById('lightbox-root');
  root.innerHTML = `<div class="lightbox"><img src="${esc(src)}" alt=""></div>`;
  root.firstChild.addEventListener('click', () => (root.innerHTML = ''));
}

/* ---------- API ---------- */

async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {} };
  if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
  if (res.status === 401 && path !== '/api/me' && path !== '/api/login') {
    state.admin = false;
    showToast('登录已过期，请重新登录', 'err');
    location.hash = '#/admin';
    throw new Error('未登录');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '上传失败');
  return data.url;
}

/* ---------- 路由 ---------- */

function route() {
  const hash = location.hash || '#/';
  const parts = hash.slice(2).split('/').filter(Boolean);
  const view = parts[0] || 'home';
  document.querySelectorAll('.site-nav a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === `#/${view === 'home' ? '' : view}`);
  });
  if (view === 'home') renderHome();
  else if (view === 'character') renderCharacter(parts[1]);
  else if (view === 'timeline') renderTimeline();
  else if (view === 'graph') renderGraph();
  else if (view === 'admin') renderAdmin();
  else renderHome();
}

window.addEventListener('hashchange', route);

/* ---------- 首页 ---------- */

async function renderHome() {
  stopGraphTimer();
  app.innerHTML = `
    <section class="hero">
      <div>
        <p class="kicker">OC ARCHIVE · 角色档案馆</p>
        <h1 class="hero-title">记录每一个<span class="accent">角色</span><br>与他们的羁绊</h1>
        <p class="hero-sub">人物设定 · 人物小记 · 关系图谱 · 图集上传</p>
      </div>
      <div class="hero-stat">
        <span class="hero-num" id="hero-num">–</span>
        <span class="hero-unit">位角色<br>正在记录</span>
      </div>
    </section>
    <div class="section-head">
      <h2 class="section-title">全部角色 <span class="section-en">CHARACTERS</span></h2>
      <a class="btn" href="#/graph">查看关系图 →</a>
    </div>
    <div id="char-grid" class="char-grid"><div class="empty">加载中…</div></div>
  `;
  try {
    state.characters = await api('/api/characters');
    document.getElementById('hero-num').textContent = String(state.characters.length).padStart(2, '0');
    const grid = document.getElementById('char-grid');
    if (!state.characters.length) {
      grid.innerHTML = '<div class="empty">还没有角色，去「管理」页面添加第一个吧</div>';
      return;
    }
    grid.innerHTML = state.characters
      .map(
        (c) => `
        <a class="char-card" href="#/character/${esc(c.id)}" style="--cc:${esc(c.color || '#2447f5')}">
          <div class="char-card-top">${avatarHtml(c)}<h3>${esc(c.name)}</h3></div>
          <p class="short">${esc(c.short_desc) || '暂无简介'}</p>
          <div class="tags">${tagsHtml(c.tags)}</div>
        </a>`
      )
      .join('');
  } catch (e) {
    app.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

/* ---------- 人物详情 ---------- */

async function renderCharacter(id) {
  stopGraphTimer();
  app.innerHTML = '<div class="empty">加载中…</div>';
  try {
    const c = await api(`/api/characters/${id}`);
    state.currentChar = c;
    const rels = c.relationships || [];
    const relItems = rels
      .map((r) => {
        const otherId = r.source_id === c.id ? r.target_id : r.source_id;
        const otherName = r.source_id === c.id ? r.target_name : r.source_name;
        return `
          <li class="rel-item">
            <span class="who"><a href="#/character/${esc(otherId)}">${esc(otherName)}</a></span>
            <span class="rel-label">${esc(r.label) || '关系'}</span>
            <span class="rel-desc">${esc(r.description) || ''}</span>
          </li>`;
      })
      .join('');
    const notes = c.notes || [];
    const noteItems = notes
      .map(
        (n) => `
        <div class="note-card">
          <h3>${esc(n.title) || '未命名小记'}${n.pinned ? '<span class="pin">📌</span>' : ''}</h3>
          <p class="note-content">${esc(n.content) || ''}</p>
          <div class="note-meta">${fmtDate(n.updated_at)}</div>
        </div>`
      )
      .join('');
    const imgs = c.images || [];
    const gallery = imgs.length
      ? `<div class="gallery">${imgs
          .map(
            (i) => `
            <div class="img-box">
              <img src="${esc(i.file)}" alt="${esc(i.caption || c.name)}" onclick="openLightbox('${esc(i.file)}')">
              ${i.caption ? `<div class="caption">${esc(i.caption)}</div>` : ''}
            </div>`
          )
          .join('')}</div>`
      : '<div class="empty" style="padding:16px 0">暂无图片</div>';

    app.innerHTML = `
      <a href="#/" class="back-link">← 返回列表</a>
      <div class="detail-head">
        ${avatarHtml(c, 110)}
        <div>
          <h1>${esc(c.name)}</h1>
          <p class="short">${esc(c.short_desc) || ''}</p>
          ${c.birth ? `<p class="birth-line">✦ 出生 · ${esc((c.birth.era ? c.birth.era + ' ' : '') + c.birth.year)}${c.birth.detail ? ' · ' + esc(c.birth.detail) : ''}</p>` : ''}
          <div class="tags">${tagsHtml(c.tags)}</div>
        </div>
        ${state.admin ? `<button class="btn btn-sm" id="btn-edit-char" style="margin-left:auto">编辑</button>` : ''}
      </div>
      <div class="panel">
        <h2>人物设定</h2>
        <div class="details-text">${esc(c.details) || '暂无设定，去「管理」页面补充吧。'}</div>
      </div>
      <div class="panel">
        <h2>人物小记 <span class="count">${notes.length}</span></h2>
        <div class="note-list">${noteItems || '<div class="empty" style="padding:12px 0">暂无小记</div>'}</div>
      </div>
      <div class="panel">
        <h2>人物关系 <span class="count">${rels.length}</span></h2>
        <ul class="rel-list">${relItems || '<div class="empty" style="padding:12px 0">暂无关系</div>'}</ul>
      </div>
      <div class="panel">
        <h2>图集 <span class="count">${imgs.length}</span></h2>
        ${gallery}
      </div>
    `;
    const editBtn = document.getElementById('btn-edit-char');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        state.adminEditing = state.currentChar;
        location.hash = '#/admin';
      });
    }
  } catch (e) {
    app.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

/* ---------- 关系图 ---------- */

const GRAPH_OPTIONS = {
  autoResize: true,
  nodes: {
    shape: 'dot',
    size: 22,
    borderWidth: 2,
    font: { color: '#e8e6df', size: 16, face: 'inherit', strokeWidth: 3, strokeColor: 'rgba(11,13,18,0.85)' },
    shadow: { enabled: true, color: 'rgba(0,0,0,0.5)', size: 12 },
  },
  edges: {
    color: { color: '#5d6a7c', highlight: '#d9b46a', hover: '#f2d489' },
    width: 1.6,
    smooth: { enabled: true, type: 'continuous' },
    font: { color: '#c4c9d6', size: 13, face: 'inherit', strokeWidth: 0, align: 'middle' },
    arrows: { to: { enabled: false } },
  },
  physics: {
    barnesHut: { gravitationalConstant: -9000, springLength: 170, springConstant: 0.035, damping: 0.09 },
    stabilization: { iterations: 300 },
  },
  interaction: { hover: true, tooltipDelay: 120, navigationButtons: false },
};

function stopGraphTimer() {
  if (graphTimer) {
    clearInterval(graphTimer);
    graphTimer = null;
  }
}

async function fetchGraphData() {
  try {
    state.graphData = await api('/api/graph');
    updateNetwork();
  } catch {
    /* 静默失败，下次重试 */
  }
}

function updateNetwork() {
  const data = state.graphData;
  if (!data) return;
  const nodes = data.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    color: n.color,
    title: n.short_desc || n.label,
    shape: n.avatar ? 'circularImage' : 'dot',
    image: n.avatar || undefined,
    size: n.avatar ? 26 : 22,
  }));
  const edges = data.edges.map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    label: e.label,
    title: e.description || e.label,
    arrows: e.directed ? { to: { enabled: true } } : { to: { enabled: false } },
  }));
  (state.inferredPreview || []).forEach((e, i) => {
    edges.push({
      id: '__infer__' + i,
      from: e.source,
      to: e.target,
      label: e.label,
      title: '推算关系：' + (e.reason || ''),
      dashes: [7, 4],
      color: { color: '#f2b03d', highlight: '#ffd166', hover: '#ffd166' },
      font: { color: '#f2b03d', size: 13, strokeWidth: 0, align: 'middle' },
      arrows: { to: { enabled: true } },
    });
  });

  if (!network) {
    nodesDS = new vis.DataSet(nodes);
    edgesDS = new vis.DataSet(edges);
    network = new vis.Network(document.getElementById('graph'), { nodes: nodesDS, edges: edgesDS }, GRAPH_OPTIONS);
    network.on('click', onGraphClick);
  } else {
    nodesDS.update(nodes);
    edgesDS.update(edges);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edgeIds = new Set(edges.map((e) => e.id));
    nodesDS.getIds().forEach((id) => { if (!nodeIds.has(id)) nodesDS.remove(id); });
    edgesDS.getIds().forEach((id) => { if (!edgeIds.has(id)) edgesDS.remove(id); });
  }
}

function onGraphClick(params) {
  if (params.nodes && params.nodes.length) {
    location.hash = '#/character/' + params.nodes[0];
    return;
  }
  if (params.edges && params.edges.length) {
    const edge = (state.graphData?.edges || []).find((e) => e.id === params.edges[0]);
    if (edge) showEdgeModal(edge);
  }
}

function showEdgeModal(edge) {
  const from = (state.graphData?.nodes || []).find((n) => n.id === edge.from);
  const to = (state.graphData?.nodes || []).find((n) => n.id === edge.to);
  const html = `
    <button class="close" onclick="closeModal()">×</button>
    <h3>${esc(from?.label || '?')} ${edge.directed ? '→' : '↔'} ${esc(to?.label || '?')}</h3>
    <p><strong>关系：</strong>${esc(edge.label) || '（未命名）'}</p>
    <p>${esc(edge.description) || '暂无说明'}</p>
    <div class="form-actions">
      <a class="btn" href="#/character/${esc(edge.from)}">查看 ${esc(from?.label || '')}</a>
      <a class="btn" href="#/character/${esc(edge.to)}">查看 ${esc(to?.label || '')}</a>
      ${state.admin ? `<button class="btn btn-sm" id="btn-edit-edge">编辑关系</button>
      <button class="btn btn-danger btn-sm" id="btn-del-edge">删除关系</button>` : ''}
    </div>
  `;
  openModal(html);
  document.getElementById('btn-edit-edge')?.addEventListener('click', () => {
    closeModal();
    openRelEditModal(edge);
  });
  document.getElementById('btn-del-edge')?.addEventListener('click', async () => {
    if (!confirm('确定删除这条关系？')) return;
    try {
      await api(`/api/relationships/${edge.id}`, { method: 'DELETE' });
      closeModal();
      showToast('关系已删除', 'ok');
      fetchGraphData();
    } catch (e) {
      showToast(e.message, 'err');
    }
  });
}

function openRelEditModal(edge) {
  const html = `
    <button class="close" onclick="closeModal()">×</button>
    <h3>编辑关系</h3>
    <div class="field">
      <label>关系名称（如：挚友、宿敌）</label>
      <input id="rel-label" value="${esc(edge.label)}" placeholder="例如：挚友">
    </div>
    <div class="field" style="margin-top:12px">
      <label>关系说明</label>
      <textarea id="rel-desc">${esc(edge.description || '')}</textarea>
    </div>
    <label class="checkbox-field" style="margin-top:12px">
      <input type="checkbox" id="rel-directed" ${edge.directed ? 'checked' : ''}> 有方向（A → B）
    </label>
    <div class="form-actions">
      <button class="btn btn-primary" id="btn-save-rel">保存</button>
      <button class="btn" onclick="closeModal()">取消</button>
    </div>
  `;
  openModal(html);
  document.getElementById('btn-save-rel').addEventListener('click', async () => {
    try {
      await api(`/api/relationships/${edge.id}`, {
        method: 'PUT',
        body: {
          label: document.getElementById('rel-label').value,
          description: document.getElementById('rel-desc').value,
          directed: document.getElementById('rel-directed').checked,
        },
      });
      closeModal();
      showToast('关系已更新', 'ok');
      fetchGraphData();
    } catch (e) {
      showToast(e.message, 'err');
    }
  });
}

async function renderGraph() {
  refreshAdminStatus();
  app.innerHTML = `
    <div class="toolbar">
      <h1 class="page-title" style="margin:0;font-size:22px">人物关系图</h1>
      <span class="spacer"></span>
      <button class="btn btn-sm" id="btn-infer">✨ 推算关系</button>
      <button class="btn btn-sm" id="btn-zoom-in">＋ 放大</button>
      <button class="btn btn-sm" id="btn-zoom-out">－ 缩小</button>
      <button class="btn btn-sm" id="btn-fit">适应窗口</button>
      <button class="btn btn-sm" id="btn-refresh">刷新</button>
    </div>
    <div class="graph-wrap">
      <div id="graph"></div>
      <div class="graph-hint">滚轮缩放 · 拖拽移动 · 点击人物查看详情 · 点击连线查看关系 · 推算关系可补全其他关系</div>
    </div>
  `;
  document.getElementById('btn-infer').addEventListener('click', openInferModal);
  document.getElementById('btn-zoom-in').addEventListener('click', () => network && network.zoomIn(0.25));
  document.getElementById('btn-zoom-out').addEventListener('click', () => network && network.zoomOut(0.25));
  document.getElementById('btn-fit').addEventListener('click', () => network && network.fit({ animation: true }));
  document.getElementById('btn-refresh').addEventListener('click', fetchGraphData);
  await fetchGraphData();
  stopGraphTimer();
  graphTimer = setInterval(fetchGraphData, 15000);
}

/* ---------- 关系推算 ---------- */

async function refreshAdminStatus() {
  try {
    const me = await api('/api/me');
    state.admin = !!me.admin;
  } catch {
    state.admin = false;
  }
}

function parseRelationLines(text, nameMap) {
  const errors = [];
  const relations = [];
  text.split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.includes('→') || line.includes('->')
      ? line.split(/\s*(?:→|->)\s*/).map((s) => s.trim()).filter(Boolean)
      : line.split(/\s+/);
    if (parts.length !== 3) {
      errors.push(`无法解析：${line}`);
      return;
    }
    const [a, label, b] = parts;
    const sid = nameMap.get(a);
    const tid = nameMap.get(b);
    if (!sid) { errors.push(`找不到角色「${a}」`); return; }
    if (!tid) { errors.push(`找不到角色「${b}」`); return; }
    if (sid === tid) { errors.push(`「${a}」不能与自己建立关系`); return; }
    relations.push({ source: sid, target: tid, label });
  });
  return { relations, errors };
}

function openInferModal() {
  const nodes = state.graphData?.nodes || [];
  const [a, b] = nodes;
  const example = a && b ? `${a.label} 师父 ${b.label}` : '林晚 师父 江澈';
  openModal(`
    <button class="close" onclick="closeModal()">×</button>
    <h3>关系推算</h3>
    <p class="field-hint">输入你已知的部分人物关系，系统会按「对等 / 互反 / 辈分链条」规则推算其他关系。每行一条：<code>A 关系 B</code>，也可写成 <code>A → 关系 → B</code>。</p>
    <div class="field" style="margin-top:12px">
      <textarea id="infer-input" rows="6" style="min-height:130px" placeholder="${esc(example)}\n# 每行一条，例如：\n${esc(example)}"></textarea>
    </div>
    <label class="checkbox-field" style="margin-top:10px">
      <input type="checkbox" id="infer-combine" checked> 结合图中已有关系一起推算
    </label>
    <div id="infer-result" style="margin-top:12px"></div>
    <div class="form-actions">
      <button class="btn btn-primary" id="btn-run-infer">开始推算</button>
      <button class="btn" onclick="closeModal()">关闭</button>
    </div>
  `);
  document.getElementById('btn-run-infer').addEventListener('click', runInfer);
}

async function runInfer() {
  const input = document.getElementById('infer-input').value;
  const nameMap = new Map((state.graphData?.nodes || []).map((n) => [n.label, n.id]));
  const { relations, errors } = parseRelationLines(input, nameMap);
  const resultEl = document.getElementById('infer-result');
  if (!relations.length) {
    resultEl.innerHTML = `<div class="empty" style="padding:10px 0">${errors.map(esc).join('<br>') || '请先输入关系'}</div>`;
    return;
  }
  resultEl.innerHTML = '<div class="empty" style="padding:10px 0">推算中…</div>';
  try {
    const data = await api('/api/graph/infer', {
      method: 'POST',
      body: { relations, include_existing: document.getElementById('infer-combine').checked },
    });
    state.inferResult = data.inferred || [];
    renderInferResult(errors);
  } catch (e) {
    resultEl.innerHTML = `<div class="empty" style="padding:10px 0">${esc(e.message)}</div>`;
  }
}

function renderInferResult(errors) {
  const resultEl = document.getElementById('infer-result');
  const list = state.inferResult || [];
  const rows = list
    .map(
      (r, i) => `
      <label class="infer-item">
        <input type="checkbox" class="infer-check" value="${i}" checked>
        <span>
          <span class="infer-rel">${esc(r.source_name)} <em>${esc(r.label)}</em> ${esc(r.target_name)}</span>
          <span class="infer-reason">依据：${esc(r.reason)}</span>
        </span>
      </label>`
    )
    .join('');
  const errHtml = errors.length
    ? `<div class="empty" style="padding:8px 0;color:var(--red,#e84a3a)">${errors.map(esc).join('<br>')}</div>`
    : '';
  resultEl.innerHTML =
    errHtml +
    (list.length
      ? `<div class="infer-legend">推算到 <b>${list.length}</b> 条新关系${state.admin ? '' : '（登录管理后台后可保存）'}：</div>
         <div class="infer-list">${rows}</div>
         <div class="form-actions">
           ${state.admin ? '<button class="btn btn-primary btn-sm" id="btn-save-infer">保存所选关系</button>' : ''}
           <button class="btn btn-sm" id="btn-preview-infer">${state.inferredPreview.length ? '取消预览' : '在图中预览'}</button>
         </div>`
      : '<div class="empty" style="padding:10px 0">没有推算到新关系（可能已经全部存在）</div>');
  document.getElementById('btn-preview-infer')?.addEventListener('click', toggleInferPreview);
  document.getElementById('btn-save-infer')?.addEventListener('click', saveInferred);
  if (list.length && !state.inferredPreview.length) {
    state.inferredPreview = list;
    updateNetwork();
  }
}

function toggleInferPreview() {
  state.inferredPreview = state.inferredPreview.length ? [] : state.inferResult;
  updateNetwork();
  const btn = document.getElementById('btn-preview-infer');
  if (btn) btn.textContent = state.inferredPreview.length ? '取消预览' : '在图中预览';
  showToast(state.inferredPreview.length ? '已用虚线预览推算关系' : '已取消预览', 'ok');
}

async function saveInferred() {
  const checks = [...document.querySelectorAll('.infer-check:checked')];
  const chosen = checks.map((cb) => state.inferResult[Number(cb.value)]).filter(Boolean);
  if (!chosen.length) return showToast('请先勾选要保存的关系', 'err');
  let ok = 0;
  for (const r of chosen) {
    try {
      await api('/api/relationships', {
        method: 'POST',
        body: {
          source_id: r.source,
          target_id: r.target,
          label: r.label,
          description: '由关系推算生成：' + r.reason,
          directed: true,
        },
      });
      ok++;
    } catch (e) {
      showToast(`${r.source_name} ${r.label} ${r.target_name} 保存失败：${e.message}`, 'err');
    }
  }
  if (ok) {
    state.inferredPreview = [];
    state.inferResult = [];
    closeModal();
    showToast(`已保存 ${ok} 条推算关系`, 'ok');
    await fetchGraphData();
  }
}

/* ---------- 时间线 ---------- */

const KIND_LABEL = { birth: '出生', event: '大事件', other: '其他' };

function kindLabel(kind) {
  if (typeof kind === 'string' && kind.startsWith('other:')) {
    const name = kind.slice(6).trim();
    if (name) return name;
  }
  return KIND_LABEL[kind] || '其他';
}

function kindClass(kind) {
  if (kind === 'birth') return 'birth';
  if (kind === 'event') return 'event';
  return 'other';
}

function eraLabel(era, defaultEra) {
  const e = era || defaultEra;
  return e ? `${e} ` : '';
}

async function renderTimeline() {
  stopGraphTimer();
  app.innerHTML = `
    <section class="hero hero-sm">
      <div>
        <p class="kicker">WORLD CHRONICLE · 架空历</p>
        <h1 class="hero-title">世界<span class="accent">时间线</span></h1>
        <p class="hero-sub">角色出生 · 大事件 · 自定义事件类型</p>
      </div>
    </section>
    <div class="section-head">
      <h2 class="section-title">全部节点 <span class="section-en">TIMELINE</span></h2>
      <div class="tl-legend" id="tl-legend">
        <span class="tl-legend-item"><i class="tl-mark birth"></i>出生</span>
        <span class="tl-legend-item"><i class="tl-mark event"></i>大事件</span>
      </div>
    </div>
    <div id="tl-list" class="timeline"><div class="empty">加载中…</div></div>
  `;
  try {
    const [events, settings] = await Promise.all([api('/api/events'), api('/api/settings')]);
    document.getElementById('tl-legend').innerHTML = [
      '<span class="tl-legend-item"><i class="tl-mark birth"></i>出生</span>',
      '<span class="tl-legend-item"><i class="tl-mark event"></i>大事件</span>',
      ...(settings.event_kinds || []).map(
        (k) => `<span class="tl-legend-item"><i class="tl-mark other"></i>${esc(k)}</span>`
      ),
    ].join('');
    const defaultEra = settings.timeline_era || '';
    const list = document.getElementById('tl-list');
    if (!events.length) {
      list.innerHTML = '<div class="empty">时间线还是空的，去「管理 → 时间线管理」添加第一个节点吧</div>';
      return;
    }
    list.innerHTML = events
      .map(
        (e) => `
        <div class="tl-item ${esc(kindClass(e.kind))}">
          <span class="tl-marker"></span>
          <div class="tl-head">
            <span class="tl-date">${esc(eraLabel(e.era, defaultEra) + e.year)}</span>
            ${e.detail ? `<span class="tl-detail">· ${esc(e.detail)}</span>` : ''}
            <span class="tl-badge">${esc(kindLabel(e.kind))}</span>
          </div>
          <h3 class="tl-title">${esc(e.title)}</h3>
          ${e.description ? `<p class="tl-desc">${esc(e.description)}</p>` : ''}
          ${e.characters?.length ? `
            <div class="tl-chars">
              ${e.characters
                .map(
                  (ch) => `
                  <a class="char-chip" href="#/character/${esc(ch.id)}" title="查看 ${esc(ch.name)}">
                    ${avatarHtml(ch, 20)}<span>${esc(ch.name)}</span>
                  </a>`
                )
                .join('')}
            </div>` : ''}
        </div>`
      )
      .join('');
  } catch (e) {
    document.getElementById('tl-list').innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

function renderAdminTimeline() {
  const body = document.getElementById('admin-body');
  if (!body) return;
  body.innerHTML = '<div class="empty">加载中…</div>';
  Promise.all([api('/api/events'), api('/api/settings'), api('/api/characters')]).then(async ([events, settings, chars]) => {
    state.characters = chars;
    state.customKinds = settings.event_kinds || [];
    const era = settings.timeline_era || '';
    body.innerHTML = `
      <div class="panel">
        <h2>历法设置</h2>
        <div class="form-grid" style="grid-template-columns:1fr auto;align-items:end">
          <div class="field">
            <label>默认纪年名称</label>
            <input id="tl-era-input" value="${esc(era)}" placeholder="如：星历 / 第三纪元（留空则不显示）">
          </div>
          <button class="btn btn-primary btn-sm" id="btn-save-era">保存</button>
        </div>
        <p class="field-hint">节点可单独指定纪年名称；留空的节点使用这里的默认名称。</p>
      </div>
      <div class="panel">
        <h2>事件类型</h2>
        <p class="field-hint">「出生」「大事件」为内置类型；添加的自定义类型会出现在新建 / 编辑事件的下拉框中。</p>
        <div class="kind-manage" id="kind-list">
          ${
            state.customKinds.length
              ? state.customKinds
                  .map(
                    (k) => `
                    <span class="kind-chip">${esc(k)}<button class="kind-del" data-kind-del="${esc(k)}" title="删除类型 ${esc(k)}">×</button></span>`
                  )
                  .join('')
              : '<span class="field-hint">暂无自定义类型</span>'
          }
        </div>
        <div class="form-grid" style="grid-template-columns:1fr auto;align-items:end">
          <div class="field">
            <label>添加新类型</label>
            <input id="kind-new-input" placeholder="如：相遇 / 决战 / 死亡">
          </div>
          <button class="btn btn-blue btn-sm" id="btn-add-kind">添加</button>
        </div>
      </div>
      <div class="section-head" style="margin-top:6px">
        <h2 class="section-title">事件节点 <span class="section-en">${events.length} EVENTS</span></h2>
        <button class="btn btn-blue btn-sm" id="btn-new-event">＋ 新建事件</button>
      </div>
      <div id="event-list" class="admin-list">
        ${events.length ? '' : '<div class="empty">暂无事件</div>'}
      </div>
    `;
    document.getElementById('btn-save-era').addEventListener('click', async () => {
      try {
        await api('/api/settings', {
          method: 'PUT',
          body: { timeline_era: document.getElementById('tl-era-input').value },
        });
        showToast('历法设置已保存', 'ok');
      } catch (err) {
        showToast(err.message, 'err');
      }
    });
    document.getElementById('btn-add-kind').addEventListener('click', async () => {
      const input = document.getElementById('kind-new-input');
      const name = (input.value || '').trim().slice(0, 30);
      if (!name) return showToast('请输入类型名称', 'err');
      if (['出生', '大事件', '其他'].includes(name)) return showToast('该名称与内置类型重复', 'err');
      if (state.customKinds.includes(name)) return showToast('该类型已存在', 'err');
      try {
        await api('/api/settings', { method: 'PUT', body: { event_kinds: [...state.customKinds, name] } });
        showToast('类型已添加', 'ok');
        renderAdminTimeline();
      } catch (err) {
        showToast(err.message, 'err');
      }
    });
    document.getElementById('kind-new-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-add-kind').click();
    });
    document.querySelectorAll('[data-kind-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const name = b.dataset.kindDel;
        if (!confirm(`确定删除类型「${name}」？已有该类型的事件不会受影响。`)) return;
        try {
          await api('/api/settings', {
            method: 'PUT',
            body: { event_kinds: state.customKinds.filter((k) => k !== name) },
          });
          showToast('类型已删除', 'ok');
          renderAdminTimeline();
        } catch (err) {
          showToast(err.message, 'err');
        }
      })
    );
    document.getElementById('btn-new-event').addEventListener('click', () => openEventModal(null));
    const list = document.getElementById('event-list');
    list.innerHTML = events
      .map(
        (e) => `
        <div class="admin-row">
          <span class="tl-badge" data-kind="${esc(e.kind)}">${esc(kindLabel(e.kind))}</span>
          <span class="name">${esc(e.title)}</span>
          <span class="meta">${esc(eraLabel(e.era, era) + e.year)}${e.detail ? ' · ' + esc(e.detail) : ''}</span>
          <span class="meta">${esc((e.characters || []).map((c) => c.name).join('、') || '无关联角色')}</span>
          <button class="btn btn-sm" data-ev-edit="${esc(e.id)}">编辑</button>
          <button class="btn btn-danger btn-sm" data-ev-del="${esc(e.id)}">删除</button>
        </div>`
      )
      .join('');
    list.querySelectorAll('[data-ev-edit]').forEach((b) => {
      const ev = events.find((e) => e.id === b.dataset.evEdit);
      b.addEventListener('click', () => openEventModal(ev));
    });
    list.querySelectorAll('[data-ev-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('确定删除这个时间线节点？')) return;
        try {
          await api(`/api/events/${b.dataset.evDel}`, { method: 'DELETE' });
          showToast('事件已删除', 'ok');
          renderAdminTimeline();
        } catch (err) {
          showToast(err.message, 'err');
        }
      })
    );
  }).catch((err) => {
    body.innerHTML = `<div class="empty">加载失败：${esc(err.message)}</div>`;
  });
}

function openEventModal(event) {
  const chars = state.characters || [];
  const customKinds = state.customKinds || [];
  const linked = new Set((event?.characters || []).map((c) => c.id));
  const charOptions = chars
    .map(
      (c) => `
      <label class="event-char-opt">
        <input type="checkbox" value="${esc(c.id)}" ${linked.has(c.id) ? 'checked' : ''}>
        ${esc(c.name)}
      </label>`
    )
    .join('') || '<span class="field-hint">还没有角色，可先创建角色再关联</span>';
  const currentKind = event?.kind || 'event';
  const currentCustom =
    typeof currentKind === 'string' && currentKind.startsWith('other:') ? currentKind.slice(6) : null;
  const kindOptions = [
    `<option value="event" ${currentKind === 'event' ? 'selected' : ''}>大事件</option>`,
    `<option value="birth" ${currentKind === 'birth' ? 'selected' : ''}>出生</option>`,
    ...customKinds.map(
      (k) => `<option value="other:${esc(k)}" ${currentCustom === k ? 'selected' : ''}>${esc(k)}</option>`
    ),
  ];
  if (currentKind === 'other') {
    kindOptions.push('<option value="other" selected>其他（旧数据）</option>');
  } else if (currentCustom && !customKinds.includes(currentCustom)) {
    kindOptions.push(`<option value="${esc(currentKind)}" selected>${esc(currentCustom)}</option>`);
  }
  kindOptions.push('<option value="__new__">＋ 新建类型…</option>');
  const html = `
    <button class="close" onclick="closeModal()">×</button>
    <h3>${event ? '编辑事件' : '新建事件'}</h3>
    <div class="form-grid">
      <div class="field full">
        <label>标题 *</label>
        <input id="ev-title" value="${esc(event?.title || '')}" placeholder="如：林晚 出生 / 北境之乱">
      </div>
      <div class="field">
        <label>类型</label>
        <select id="ev-kind">${kindOptions.join('')}</select>
      </div>
      <div class="field full" id="ev-kind-new-row" style="display:none">
        <label>新类型名称</label>
        <input id="ev-kind-new" placeholder="输入新类型名称，如：相遇 / 决战">
      </div>
      <div class="field">
        <label>年份 *（可为负数）</label>
        <input type="number" id="ev-year" value="${event?.year ?? ''}" placeholder="如：1408">
      </div>
      <div class="field">
        <label>纪年名称</label>
        <input id="ev-era" value="${esc(event?.era || '')}" placeholder="留空用默认纪年">
      </div>
      <div class="field">
        <label>细分时间（可选）</label>
        <input id="ev-detail" value="${esc(event?.detail || '')}" placeholder="如：春 / 三月·十五">
      </div>
      <div class="field full">
        <label>描述</label>
        <textarea id="ev-desc" rows="3">${esc(event?.description || '')}</textarea>
      </div>
      <div class="field full">
        <label>关联角色（可多选）</label>
        <div class="event-char-list">${charOptions}</div>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-primary" id="btn-save-event">${event ? '保存修改' : '创建事件'}</button>
      <button class="btn" onclick="closeModal()">取消</button>
    </div>
  `;
  openModal(html);
  const kindSelect = document.getElementById('ev-kind');
  const kindNewRow = document.getElementById('ev-kind-new-row');
  const kindNewInput = document.getElementById('ev-kind-new');
  kindSelect.addEventListener('change', () => {
    const isNew = kindSelect.value === '__new__';
    kindNewRow.style.display = isNew ? '' : 'none';
    if (isNew) kindNewInput.focus();
  });
  document.getElementById('btn-save-event').addEventListener('click', async () => {
    let kind = kindSelect.value;
    let newKindName = null;
    if (kind === '__new__') {
      newKindName = (kindNewInput.value || '').trim().slice(0, 30);
      if (!newKindName) return showToast('请输入新类型名称', 'err');
      if (['出生', '大事件', '其他'].includes(newKindName)) {
        kind = newKindName === '出生' ? 'birth' : newKindName === '大事件' ? 'event' : 'other';
      } else {
        kind = `other:${newKindName}`;
      }
    }
    const body = {
      title: document.getElementById('ev-title').value,
      kind,
      year: Number(document.getElementById('ev-year').value),
      era: document.getElementById('ev-era').value,
      detail: document.getElementById('ev-detail').value,
      description: document.getElementById('ev-desc').value,
      character_ids: [...document.querySelectorAll('.event-char-opt input:checked')].map((i) => i.value),
    };
    try {
      if (newKindName && !['出生', '大事件', '其他'].includes(newKindName) && !state.customKinds.includes(newKindName)) {
        await api('/api/settings', { method: 'PUT', body: { event_kinds: [...state.customKinds, newKindName] } });
      }
      if (event) {
        await api(`/api/events/${event.id}`, { method: 'PUT', body });
      } else {
        await api('/api/events', { method: 'POST', body });
      }
      closeModal();
      showToast('时间线已更新', 'ok');
      renderAdminTimeline();
    } catch (e) {
      showToast(e.message, 'err');
    }
  });
}

/* ---------- 管理后台 ---------- */

async function renderAdmin() {
  stopGraphTimer();
  if (!state.admin) {
    try {
      const me = await api('/api/me');
      state.admin = me.admin;
    } catch {
      state.admin = false;
    }
  }
  if (!state.admin) {
    app.innerHTML = `
      <div class="login-box">
        <h1>管理后台</h1>
        <div class="field">
          <label>管理员密码</label>
          <input type="password" id="login-pass" placeholder="请输入密码" autocomplete="current-password">
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" id="btn-login">登录</button>
        </div>
      </div>
    `;
    const doLogin = async () => {
      try {
        await api('/api/login', { method: 'POST', body: { password: document.getElementById('login-pass').value } });
        state.admin = true;
        showToast('登录成功', 'ok');
        renderAdmin();
      } catch (e) {
        showToast(e.message, 'err');
      }
    };
    document.getElementById('btn-login').addEventListener('click', doLogin);
    document.getElementById('login-pass').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLogin();
    });
    return;
  }

  if (state.adminEditing) {
    state.adminMode = 'chars';
    renderCharEditor();
    return;
  }

  app.innerHTML = `
    <div class="toolbar">
      <h1 class="page-title" style="margin:0;font-size:22px">管理后台</h1>
      <span class="spacer"></span>
      <div class="tabbar">
        <button class="btn btn-sm ${state.adminMode === 'chars' ? 'btn-blue' : ''}" id="btn-mode-chars">角色管理</button>
        <button class="btn btn-sm ${state.adminMode === 'timeline' ? 'btn-blue' : ''}" id="btn-mode-timeline">时间线管理</button>
      </div>
      <button class="btn" id="btn-logout">退出登录</button>
    </div>
    <div id="admin-body"><div class="empty">加载中…</div></div>
  `;
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    state.admin = false;
    renderAdmin();
  });
  document.getElementById('btn-mode-chars').addEventListener('click', () => {
    state.adminMode = 'chars';
    state.adminEditing = null;
    renderAdmin();
  });
  document.getElementById('btn-mode-timeline').addEventListener('click', () => {
    state.adminMode = 'timeline';
    state.adminEditing = null;
    renderAdmin();
  });

  if (state.adminMode === 'timeline') {
    renderAdminTimeline();
    return;
  }

  const body = document.getElementById('admin-body');
  body.innerHTML = `
    <div class="form-actions" style="margin-bottom:18px">
      <button class="btn btn-primary" id="btn-new-char">＋ 新建角色</button>
    </div>
    <div id="admin-list" class="admin-list"><div class="empty">加载中…</div></div>
  `;
  document.getElementById('btn-new-char').addEventListener('click', () => {
    state.adminEditing = { id: null, name: '', color: '#7c6cf0', tags: [], short_desc: '', details: '', avatar: '', images: [], notes: [], relationships: [] };
    renderAdmin();
  });
  try {
    state.characters = await api('/api/characters');
    const list = document.getElementById('admin-list');
    if (!state.characters.length) {
      list.innerHTML = '<div class="empty">还没有角色，点击「新建角色」开始吧</div>';
      return;
    }
    list.innerHTML = state.characters
      .map(
        (c) => `
        <div class="admin-row">
          ${avatarHtml(c, 38)}
          <span class="name">${esc(c.name)}</span>
          <span class="meta">${(c.tags || []).join(' · ')}</span>
          <a class="btn btn-sm" href="#/character/${esc(c.id)}">查看</a>
          <button class="btn btn-sm" data-edit="${esc(c.id)}">编辑</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(c.id)}">删除</button>
        </div>`
      )
      .join('');
    list.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', async () => {
        state.adminEditing = await api(`/api/characters/${b.dataset.edit}`);
        renderAdmin();
      })
    );
    list.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm(`确定删除「${state.characters.find((c) => c.id === b.dataset.del)?.name}」？相关小记、关系、图片都会一并删除。`)) return;
        try {
          await api(`/api/characters/${b.dataset.del}`, { method: 'DELETE' });
          showToast('角色已删除', 'ok');
          renderAdmin();
        } catch (e) {
          showToast(e.message, 'err');
        }
      })
    );
  } catch (e) {
    document.getElementById('admin-list').innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

/* ---------- 角色编辑器 ---------- */

function renderCharEditor() {
  const c = state.adminEditing;
  const isNew = !c.id;
  const allOthers = state.characters.filter((x) => x.id !== c.id);
  const rels = c.relationships || [];
  const relItems = rels
    .map((r) => {
      const otherId = r.source_id === c.id ? r.target_id : r.source_id;
      const otherName = r.source_id === c.id ? r.target_name : r.source_name;
      return `
        <div class="admin-row">
          <span class="name">${esc(otherName)}</span>
          <span class="rel-label" style="background:rgba(124,108,240,.15);color:#b3aaff;border:1px solid rgba(124,108,240,.35);border-radius:999px;padding:1px 10px;font-size:12px">${esc(r.label) || '关系'}</span>
          <span class="meta" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.description) || ''}</span>
          <button class="btn btn-sm" data-rel-edit="${esc(r.id)}">编辑</button>
          <button class="btn btn-danger btn-sm" data-rel-del="${esc(r.id)}">删除</button>
        </div>`;
    })
    .join('');
  const notes = c.notes || [];
  const noteItems = notes
    .map(
      (n) => `
      <div class="admin-row">
        <span class="name">${esc(n.title) || '未命名'}${n.pinned ? ' 📌' : ''}</span>
        <span class="meta" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n.content) || ''}</span>
        <button class="btn btn-sm" data-note-edit="${esc(n.id)}">编辑</button>
        <button class="btn btn-danger btn-sm" data-note-del="${esc(n.id)}">删除</button>
      </div>`
    )
    .join('');
  const imgs = c.images || [];
  const gallery = imgs.length
    ? `<div class="gallery">${imgs
        .map(
          (i) => `
          <div class="img-box">
            <img src="${esc(i.file)}" alt="" onclick="openLightbox('${esc(i.file)}')">
            <button class="img-del" data-img-del="${esc(i.id)}">删除</button>
          </div>`
        )
        .join('')}</div>`
    : '<div class="empty" style="padding:12px 0">暂无图片</div>';

  app.innerHTML = `
    <div class="toolbar">
      <button class="btn btn-sm" id="btn-back-admin">← 返回</button>
      <h1 class="page-title" style="margin:0;font-size:22px">${isNew ? '新建角色' : `编辑：${esc(c.name)}`}</h1>
      <span class="spacer"></span>
      ${isNew ? '' : '<a class="btn btn-sm" href="#/character/' + esc(c.id) + '">查看页面</a>'}
    </div>

    <div class="panel">
      <h2>基本信息</h2>
      <div class="form-grid">
        <div class="field">
          <label>名字 *</label>
          <input id="f-name" value="${esc(c.name)}" placeholder="角色名字">
        </div>
        <div class="field">
          <label>代表色（关系图节点颜色）</label>
          <input type="color" id="f-color" value="${esc(c.color || '#7c6cf0')}">
        </div>
        <div class="field full">
          <label>标签（逗号分隔，如：主角, 剑修）</label>
          <input id="f-tags" value="${esc((c.tags || []).join(', '))}" placeholder="主角, 剑修">
        </div>
        <div class="field full">
          <label>一句话简介</label>
          <input id="f-short" value="${esc(c.short_desc || '')}" placeholder="用一句话介绍这个角色">
        </div>
        <div class="field full">
          <label>人物设定（可多行）</label>
          <textarea id="f-details" rows="6" placeholder="外貌、性格、背景故事……">${esc(c.details || '')}</textarea>
        </div>
        <div class="field full">
          <label>头像图片</label>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <input type="file" id="f-avatar-file" accept="image/*">
            <button class="btn btn-sm" id="btn-upload-avatar">上传为头像</button>
            <span id="avatar-preview"></span>
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" id="btn-save-char">${isNew ? '创建角色' : '保存修改'}</button>
      </div>
    </div>

    ${isNew ? '' : `
    <div class="panel">
      <h2>出生节点 <span class="count">（显示在世界时间线）</span></h2>
      <div class="form-grid">
        <div class="field">
          <label>出生年份 *（可为负数）</label>
          <input type="number" id="b-year" value="${esc(c.birth?.year ?? '')}" placeholder="如：1408">
        </div>
        <div class="field">
          <label>纪年名称（留空用默认）</label>
          <input id="b-era" value="${esc(c.birth?.era || '')}" placeholder="如：星历">
        </div>
        <div class="field full">
          <label>细分时间（可选）</label>
          <input id="b-detail" value="${esc(c.birth?.detail || '')}" placeholder="如：南疆雪岭 / 三月·十五">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary btn-sm" id="btn-save-birth">保存出生节点</button>
        ${c.birth ? '<button class="btn btn-danger btn-sm" id="btn-del-birth">移除出生节点</button>' : ''}
      </div>
    </div>

    <div class="panel">
      <h2>图集</h2>
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <input type="file" id="f-gallery-file" accept="image/*" style="flex:1;min-width:220px">
        <input id="f-gallery-caption" placeholder="图片说明（可选）" style="flex:1;min-width:180px;background:var(--panel-2);border:1px solid var(--border);border-radius:9px;color:var(--text);padding:9px 12px">
        <button class="btn btn-sm" id="btn-upload-gallery">上传</button>
      </div>
      ${gallery}
    </div>

    <div class="panel">
      <h2>人物小记</h2>
      <div id="note-form-wrap"></div>
      <div id="note-list" class="admin-list" style="margin-top:14px">${noteItems || '<div class="empty" style="padding:12px 0">暂无小记</div>'}</div>
    </div>

    <div class="panel">
      <h2>人物关系</h2>
      <div id="rel-form-wrap"></div>
      <div id="rel-list" class="admin-list" style="margin-top:14px">${relItems || '<div class="empty" style="padding:12px 0">暂无关系</div>'}</div>
    </div>
    `}
  `;

  document.getElementById('btn-back-admin').addEventListener('click', () => {
    state.adminEditing = null;
    renderAdmin();
  });
  document.getElementById('btn-save-char').addEventListener('click', saveCharacter);
  document.getElementById('btn-upload-avatar').addEventListener('click', async () => {
    const file = document.getElementById('f-avatar-file').files[0];
    if (!file) return showToast('请先选择图片文件', 'err');
    try {
      const url = await uploadFile(file);
      c.avatar = url;
      document.getElementById('avatar-preview').innerHTML = `<img src="${esc(url)}" class="avatar" style="width:44px;height:44px">`;
      showToast('头像已上传，保存后生效', 'ok');
    } catch (e) {
      showToast(e.message, 'err');
    }
  });
  if (c.avatar) {
    document.getElementById('avatar-preview').innerHTML = `<img src="${esc(c.avatar)}" class="avatar" style="width:44px;height:44px">`;
  }

  if (!isNew) {
    document.getElementById('btn-upload-gallery').addEventListener('click', async () => {
      const file = document.getElementById('f-gallery-file').files[0];
      if (!file) return showToast('请先选择图片文件', 'err');
      try {
        const url = await uploadFile(file);
        await api(`/api/characters/${c.id}/images`, {
          method: 'POST',
          body: { file: url, caption: document.getElementById('f-gallery-caption').value },
        });
        showToast('图片已上传', 'ok');
        state.adminEditing = await api(`/api/characters/${c.id}`);
        renderAdmin();
      } catch (e) {
        showToast(e.message, 'err');
      }
    });
    document.querySelectorAll('[data-img-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('确定删除这张图片？')) return;
        try {
          await api(`/api/images/${b.dataset.imgDel}`, { method: 'DELETE' });
          showToast('图片已删除', 'ok');
          state.adminEditing = await api(`/api/characters/${c.id}`);
          renderAdmin();
        } catch (e) {
          showToast(e.message, 'err');
        }
      })
    );
    document.querySelectorAll('[data-note-edit]').forEach((b) => {
      const n = notes.find((x) => x.id === b.dataset.noteEdit);
      b.addEventListener('click', () => openNoteForm(n));
    });
    document.querySelectorAll('[data-note-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('确定删除这条小记？')) return;
        try {
          await api(`/api/notes/${b.dataset.noteDel}`, { method: 'DELETE' });
          showToast('小记已删除', 'ok');
          state.adminEditing = await api(`/api/characters/${c.id}`);
          renderAdmin();
        } catch (e) {
          showToast(e.message, 'err');
        }
      })
    );
    document.querySelectorAll('[data-rel-edit]').forEach((b) => {
      const r = rels.find((x) => x.id === b.dataset.relEdit);
      b.addEventListener('click', () => openRelForm(r));
    });
    document.querySelectorAll('[data-rel-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('确定删除这条关系？')) return;
        try {
          await api(`/api/relationships/${b.dataset.relDel}`, { method: 'DELETE' });
          showToast('关系已删除', 'ok');
          state.adminEditing = await api(`/api/characters/${c.id}`);
          renderAdmin();
        } catch (e) {
          showToast(e.message, 'err');
        }
      })
    );
    document.getElementById('btn-save-birth').addEventListener('click', async () => {
      try {
        await api(`/api/characters/${c.id}/birth`, {
          method: 'POST',
          body: {
            year: Number(document.getElementById('b-year').value),
            era: document.getElementById('b-era').value,
            detail: document.getElementById('b-detail').value,
          },
        });
        showToast('出生节点已保存，已加入时间线', 'ok');
        state.adminEditing = await api(`/api/characters/${c.id}`);
        renderAdmin();
      } catch (e) {
        showToast(e.message, 'err');
      }
    });
    document.getElementById('btn-del-birth')?.addEventListener('click', async () => {
      if (!confirm('确定移除该角色的出生节点？')) return;
      try {
        await api(`/api/characters/${c.id}/birth`, { method: 'DELETE' });
        showToast('出生节点已移除', 'ok');
        state.adminEditing = await api(`/api/characters/${c.id}`);
        renderAdmin();
      } catch (e) {
        showToast(e.message, 'err');
      }
    });
    openNoteForm(null);
    openRelForm(null);
  }
}

async function saveCharacter() {
  const c = state.adminEditing;
  const body = {
    name: document.getElementById('f-name').value.trim(),
    color: document.getElementById('f-color').value,
    tags: document.getElementById('f-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
    short_desc: document.getElementById('f-short').value,
    details: document.getElementById('f-details').value,
    avatar: c.avatar || '',
  };
  if (!body.name) return showToast('角色名不能为空', 'err');
  try {
    if (c.id) {
      await api(`/api/characters/${c.id}`, { method: 'PUT', body });
      showToast('角色已保存', 'ok');
      state.adminEditing = await api(`/api/characters/${c.id}`);
    } else {
      const { id } = await api('/api/characters', { method: 'POST', body });
      showToast('角色已创建', 'ok');
      state.adminEditing = await api(`/api/characters/${id}`);
    }
    renderAdmin();
  } catch (e) {
    showToast(e.message, 'err');
  }
}

function openNoteForm(note) {
  const wrap = document.getElementById('note-form-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="form-grid" style="margin-bottom:8px">
      <div class="field full">
        <label>${note ? '编辑小记' : '新小记'}标题</label>
        <input id="n-title" value="${esc(note?.title || '')}" placeholder="如：身世、性格、时间线">
      </div>
      <div class="field full">
        <label>内容</label>
        <textarea id="n-content" rows="4" placeholder="写点什么…">${esc(note?.content || '')}</textarea>
      </div>
    </div>
    <div class="form-actions" style="margin-top:0">
      <button class="btn btn-primary btn-sm" id="btn-save-note">${note ? '保存小记' : '添加小记'}</button>
      <label class="checkbox-field">
        <input type="checkbox" id="n-pinned" ${note?.pinned ? 'checked' : ''}> 置顶
      </label>
    </div>
  `;
  document.getElementById('btn-save-note').addEventListener('click', async () => {
    const body = {
      title: document.getElementById('n-title').value,
      content: document.getElementById('n-content').value,
      pinned: document.getElementById('n-pinned').checked,
    };
    try {
      if (note) {
        await api(`/api/notes/${note.id}`, { method: 'PUT', body });
      } else {
        await api(`/api/characters/${state.adminEditing.id}/notes`, { method: 'POST', body });
      }
      showToast('小记已保存', 'ok');
      state.adminEditing = await api(`/api/characters/${state.adminEditing.id}`);
      renderAdmin();
    } catch (e) {
      showToast(e.message, 'err');
    }
  });
}

function openRelForm(rel) {
  const wrap = document.getElementById('rel-form-wrap');
  if (!wrap) return;
  const c = state.adminEditing;
  const others = state.characters.filter((x) => x.id !== c.id);
  const options = others
    .map((x) => `<option value="${esc(x.id)}" ${rel && (rel.source_id === x.id || rel.target_id === x.id) ? 'selected' : ''}>${esc(x.name)}</option>`)
    .join('');
  wrap.innerHTML = `
    <div class="form-grid" style="margin-bottom:8px">
      <div class="field">
        <label>对方角色</label>
        <select id="r-target">${options || '<option value="">（请先创建其他角色）</option>'}</select>
      </div>
      <div class="field">
        <label>关系名称</label>
        <input id="r-label" value="${esc(rel?.label || '')}" placeholder="如：挚友、宿敌">
      </div>
      <div class="field full">
        <label>关系说明（可选）</label>
        <input id="r-desc" value="${esc(rel?.description || '')}" placeholder="补充说明这段关系">
      </div>
    </div>
    <div class="form-actions" style="margin-top:0">
      <button class="btn btn-primary btn-sm" id="btn-save-rel2">${rel ? '保存关系' : '添加关系'}</button>
      <label class="checkbox-field">
        <input type="checkbox" id="r-directed" ${rel?.directed ? 'checked' : ''}> 有方向（本角色 → 对方）
      </label>
    </div>
  `;
  document.getElementById('btn-save-rel2').addEventListener('click', async () => {
    const body = {
      label: document.getElementById('r-label').value,
      description: document.getElementById('r-desc').value,
      directed: document.getElementById('r-directed').checked,
    };
    try {
      if (rel) {
        await api(`/api/relationships/${rel.id}`, { method: 'PUT', body });
      } else {
        const targetId = document.getElementById('r-target').value;
        if (!targetId) return showToast('请先创建其他角色再添加关系', 'err');
        await api('/api/relationships', { method: 'POST', body: { source_id: c.id, target_id: targetId, ...body } });
      }
      showToast('关系已保存，关系图已更新', 'ok');
      state.adminEditing = await api(`/api/characters/${c.id}`);
      renderAdmin();
    } catch (e) {
      showToast(e.message, 'err');
    }
  });
}

/* ---------- 启动 ---------- */

api('/api/me')
  .then((r) => (state.admin = r.admin))
  .catch(() => {});
route();
