(() => {
  'use strict';
  const data = window.RADAR;
  const $ = selector => document.querySelector(selector);
  const state = { query: '', category: '', watch: false, sort: 'implied_value_usd', direction: -1 };
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = n => '$' + (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n.toFixed(0));
  const exact = n => '$' + n.toLocaleString('en-US', {maximumFractionDigits: 0});
  const percent = n => n === null ? '—' : (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  const badge = row => row.watchlist ? '<span class="badge">WATCHLIST</span>' : '';
  const dialog = $('#detail');
  let returnHash = '';
  $('#snapshot').textContent = 'SNAPSHOT / ' + data.as_of;
  $('#stats').innerHTML = `<div class="stat"><strong>${data.rows.length}</strong><span>protocols ranked</span></div><div class="stat"><strong>${data.rows.filter(r => r.watchlist).length}<small>/${data.watchlist_size}</small></strong><span>watchlist covered</span></div><div class="stat"><strong>${data.model.global_peer_count}</strong><span>tokenized comparables used</span></div>`;
  [...new Set(data.rows.map(r => r.category || 'Uncategorized'))].sort().forEach(category => {
    const option = document.createElement('option'); option.value = category; option.textContent = category; $('#category').append(option);
  });
  function render() {
    const query = state.query.trim().toLowerCase();
    const rows = data.rows.filter(r => (!state.watch || r.watchlist) && (!state.category || (r.category || 'Uncategorized') === state.category) && [r.name, r.slug, r.category, ...r.chains].join(' ').toLowerCase().includes(query));
    rows.sort((a,b) => {
      const av = a[state.sort], bv = b[state.sort];
      if (av === null) return bv === null ? a.rank - b.rank : 1;
      if (bv === null) return -1;
      return (av - bv) * state.direction || a.rank - b.rank;
    });
    $('#watchlist').setAttribute('aria-pressed', String(state.watch));
    $('#scope').textContent = state.watch ? '/ WATCHLIST' : '/ ALL SIGNALS';
    $('#count').textContent = `${rows.length} / ${data.rows.length} signals`;
    $('#empty').hidden = rows.length > 0;
    document.querySelectorAll('th[data-key]').forEach(th => {
      const active = th.dataset.key === state.sort;
      if (active) th.setAttribute('aria-sort', state.direction === -1 ? 'descending' : 'ascending'); else th.removeAttribute('aria-sort');
      const label = {tvl_usd:'TVL',change_7d:'7d change',implied_value_usd:'Implied value'}[th.dataset.key];
      th.firstElementChild.textContent = label + (active ? state.direction === -1 ? ' ↓' : ' ↑' : ' ↕');
    });
    $('#rows').innerHTML = rows.map(r => `<tr data-slug="${escape(r.slug)}"><td>${String(r.rank).padStart(2,'0')}</td><td><a class="protocol" href="#p/${encodeURIComponent(r.slug)}">${escape(r.name)}</a>${badge(r)}</td><td>${escape(r.category || 'Uncategorized')}</td><td title="${escape(r.chains.join(', '))}">${escape(r.chains.slice(0,2).join(', ') || 'Unspecified')}${r.chains.length > 2 ? ' +' + (r.chains.length-2) : ''}</td><td class="number" title="${exact(r.tvl_usd)}">${money(r.tvl_usd)}</td><td class="number ${r.change_7d > 0 ? 'positive' : 'negative'}">${percent(r.change_7d)}</td><td class="number value" title="${exact(r.implied_value_usd)}">${money(r.implied_value_usd)}<i class="value-bar" style="width:${Math.max(2,r.implied_value_usd/data.rows[0].implied_value_usd*100)}px"></i></td><td>↗</td></tr>`).join('');
  }
  function openDetail(row) {
    const peers = data.model.category_multiples.find(c => c.category === row.category);
    const factor = (label, value) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`;
    dialog.innerHTML = `<div class="detail-head"><div><span class="eyebrow">PROTOCOL DOSSIER / RANK ${String(row.rank).padStart(2,'0')}</span><h2 id="detail-title">${escape(row.name)} ${badge(row)}</h2><p>${escape(row.category || 'Uncategorized')} · ${escape(row.chains.join(', ') || 'Unspecified chain')} · Pre-token</p></div><button class="close" autofocus>Close ×</button></div><div class="detail-grid"><section><div class="valuation"><span class="eyebrow">IMPLIED VALUE / USD</span><strong>${money(row.implied_value_usd)}</strong><small>${exact(row.implied_value_usd)} · model estimate</small></div><div class="figures"><div><span>TVL</span><b title="${exact(row.tvl_usd)}">${money(row.tvl_usd)}</b></div><div><span>7D CHANGE</span><b>${percent(row.change_7d)}</b></div><div><span>AGE WITH NO TOKEN</span><b>${row.age_days} days</b></div><div><span>CHAIN BREADTH</span><b>${row.chains.length} chains</b></div></div><h3>Model breakdown</h3><dl class="breakdown">${factor('Base multiple · '+ (peers.source === 'category' ? peers.peer_count + ' category peers' : data.model.global_peer_count + ' global peers; ' + peers.peer_count + ' category peers'),row.multiple + '×')}${factor('Momentum · 1 + clamp(7d, −30, 60) / 250',row.momentum + '×')}${factor('Maturity · 0.8 + 0.4 × min(age, 1460) / 1460',row.maturity + '×')}${factor('Breadth · 1 + 0.015 × min(chains − 1, 8)',row.breadth + '×')}</dl><p class="model-note">Base median before bounds: ${escape(peers.raw_multiple)}×. Multiply TVL by all four factors, round to whole USD, minimum $1. ${row.listed_at === null ? 'Listing date unknown: model uses 180 days.' : 'Age measured from listing on ' + escape(row.listed_at) + '.'} Missing 7d change uses 0%.</p></section><section><div class="plan-head"><h3>Farm checklist</h3><span id="progress">0 / ${row.farm_steps.length} complete</span></div><ol class="steps">${row.farm_steps.map((step,i) => `<li><label><input type="checkbox"><span><strong>${String(i+1).padStart(2,'0')} / </strong>${escape(step)}</span></label></li>`).join('')}</ol><p class="plan-note">Category-based preparation plan. Costs are estimates; eligibility and rewards are not guaranteed. Checklist progress lasts while this detail is open.</p></section></div>`;
    $('.close').onclick = closeDetail;
    dialog.onchange = () => { $('#progress').textContent = `${dialog.querySelectorAll('input:checked').length} / ${row.farm_steps.length} complete`; };
    if (!dialog.open) dialog.showModal();
  }
  function closeDetail() { location.hash = returnHash; }
  function route() {
    const hash = location.hash;
    if (hash.startsWith('#p/')) {
      let slug; try { slug = decodeURIComponent(hash.slice(3)); } catch { slug = ''; }
      const row = data.rows.find(r => r.slug === slug);
      if (row) { openDetail(row); return; }
    }
    if (dialog.open) dialog.close();
    state.watch = hash === '#watchlist';
    returnHash = state.watch ? '#watchlist' : '';
    render();
  }
  $('#search').oninput = event => { state.query = event.target.value; render(); };
  $('#category').onchange = event => { state.category = event.target.value; render(); };
  $('#watchlist').onclick = () => { location.hash = state.watch ? '' : '#watchlist'; };
  document.querySelectorAll('th[data-key] button').forEach(button => button.onclick = () => {
    const key = button.parentElement.dataset.key;
    state.direction = state.sort === key ? -state.direction : -1; state.sort = key; render();
  });
  $('#rows').onclick = event => {
    const row = event.target.closest('tr');
    if (row && !event.target.closest('a')) location.hash = '#p/' + encodeURIComponent(row.dataset.slug);
  };
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDetail(); });
  window.addEventListener('hashchange', route);
  render(); route();
})();
