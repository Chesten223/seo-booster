(() => {
  'use strict';

  // ── Tab switching ──
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ── Content script ──
  const EXTRACT_FN = () => {
    const data = { url: location.href, meta: [], headings: [] };

    // All meta tags
    document.querySelectorAll('meta').forEach(el => {
      const name = el.getAttribute('name') || el.getAttribute('property') || el.getAttribute('http-equiv') || '';
      const content = el.getAttribute('content') || '';
      if (name || content) data.meta.push({ name, content });
    });

    // Title
    data.title = document.title || '';

    // Canonical
    const canonical = document.querySelector('link[rel="canonical"]');
    data.canonical = canonical ? canonical.href : '';

    // Headings
    document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(el => {
      data.headings.push({ level: parseInt(el.tagName[1]), text: el.textContent.trim().substring(0, 120) });
    });

    return data;
  };

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    const tabId = tabs[0].id;

    chrome.scripting.executeScript({ target: { tabId }, func: EXTRACT_FN }, results => {
      if (!results || !results[0]) return;
      const data = results[0].result;
      renderMeta(data);
      renderPreview(data);
      renderHeadings(data);
      populateEdit(data);
    });
  });

  // ── Critical / recommended tag definitions ──
  const CRITICAL = ['description', 'og:title', 'og:description', 'og:image'];
  const RECOMMENDED = ['og:url', 'og:type', 'twitter:card', 'twitter:title', 'twitter:description', 'viewport', 'robots'];

  function getStatus(name) {
    const n = name.toLowerCase();
    if (CRITICAL.includes(n)) return 'good';
    if (RECOMMENDED.includes(n)) return 'warn';
    return '';
  }

  // ── Render Meta Tags ──
  function renderMeta(data) {
    const container = document.getElementById('tab-meta');

    // Build lookup
    const lookup = {};
    data.meta.forEach(m => { lookup[m.name.toLowerCase()] = m.content; });

    // Title row
    let html = '<table class="meta-table">';

    // title
    html += metaRow('title', data.title, data.title ? 'good' : 'bad');

    // canonical
    if (data.canonical) html += metaRow('canonical', data.canonical, 'good');

    // All meta tags found
    data.meta.forEach(m => {
      if (!m.name) return;
      const status = m.content ? getStatus(m.name) : 'bad';
      html += metaRow(m.name, m.content || '(empty)', status || 'good');
    });

    // Check for missing critical
    CRITICAL.forEach(name => {
      const found = data.meta.some(m => m.name.toLowerCase() === name);
      if (!found) html += metaRow(name, '(missing)', 'bad');
    });

    // Check for missing recommended
    RECOMMENDED.forEach(name => {
      const found = data.meta.some(m => m.name.toLowerCase() === name);
      if (!found) html += metaRow(name, '(missing)', 'warn');
    });

    html += '</table>';
    container.innerHTML = html;
  }

  function metaRow(name, value, status) {
    const dotClass = status ? ` dot-${status}` : '';
    const dot = `<span class="dot${dotClass}"></span>`;
    return `<tr><td class="tag-name">${dot}${esc(name)}</td><td class="tag-value">${esc(value)}</td></tr>`;
  }

  // ── Render OG Preview ──
  function renderPreview(data) {
    const container = document.getElementById('tab-preview');
    const lookup = {};
    data.meta.forEach(m => { lookup[m.name.toLowerCase()] = m.content; });

    const ogTitle = lookup['og:title'] || data.title || '(No title)';
    const ogDesc = lookup['og:description'] || lookup['description'] || '(No description)';
    const ogImage = lookup['og:image'] || '';
    const ogUrl = lookup['og:url'] || data.url || '';

    // Facebook-style card
    let card = '<div class="og-card">';
    card += '<div class="og-card-header">Facebook Share Preview</div>';

    if (ogImage) {
      card += `<div class="og-card-img"><img src="${esc(ogImage)}" onerror="this.parentElement.textContent=\'Image failed to load\'"></div>`;
    } else {
      card += '<div class="og-card-img">No og:image set</div>';
    }

    card += '<div class="og-card-body">';
    card += `<div class="og-card-url">${esc(shortUrl(ogUrl))}</div>`;
    card += `<div class="og-card-title">${esc(truncate(ogTitle, 80))}</div>`;
    card += `<div class="og-card-desc">${esc(truncate(ogDesc, 160))}</div>`;
    card += '</div></div>';

    // Twitter card
    const twitterCard = lookup['twitter:card'] || 'summary';
    const twitterTitle = lookup['twitter:title'] || ogTitle;
    const twitterDesc = lookup['twitter:description'] || ogDesc;
    const twitterImage = lookup['twitter:image'] || ogImage;

    card += '<div class="og-section-title">Twitter Card Preview</div>';
    card += '<div class="og-card">';
    card += `<div class="og-card-header">Twitter · ${esc(twitterCard)}</div>`;

    if (twitterImage) {
      card += `<div class="og-card-img"><img src="${esc(twitterImage)}" onerror="this.parentElement.textContent=\'Image failed to load\'"></div>`;
    } else {
      card += '<div class="og-card-img">No twitter:image set</div>';
    }

    card += '<div class="og-card-body">';
    card += `<div class="og-card-title">${esc(truncate(twitterTitle, 70))}</div>`;
    card += `<div class="og-card-desc">${esc(truncate(twitterDesc, 160))}</div>`;
    card += '</div></div>';

    container.innerHTML = card;
  }

  // ── Render Headings ──
  function renderHeadings(data) {
    const container = document.getElementById('tab-headings');
    const headings = data.headings;

    if (!headings.length) {
      container.innerHTML = '<div class="empty-state">No headings found on this page.</div>';
      return;
    }

    // Counts
    const counts = {};
    headings.forEach(h => { counts[h.level] = (counts[h.level] || 0) + 1; });

    let html = '<div class="heading-count">';
    for (let i = 1; i <= 6; i++) {
      if (counts[i]) html += `<span class="status-good">H${i}: ${counts[i]}</span>  `;
    }
    // Warn about multiple H1
    if ((counts[1] || 0) > 1) {
      html += '<br><span class="status-warn">⚠ Multiple H1 tags detected</span>';
    }
    if (!counts[1]) {
      html += '<br><span class="status-bad">⚠ No H1 tag found</span>';
    }
    html += '</div>';

    // Tree
    html += '<ul class="heading-tree">';
    headings.forEach(h => {
      const indent = (h.level - 1) * 16;
      html += `<li style="padding-left:${indent}px"><span class="h-badge h-badge-${h.level}">H${h.level}</span><span>${esc(truncate(h.text, 80))}</span></li>`;
    });
    html += '</ul>';

    container.innerHTML = html;
  }

  // ── Edit tab ──
  function populateEdit(data) {
    const lookup = {};
    data.meta.forEach(m => { lookup[m.name.toLowerCase()] = m.content; });

    document.getElementById('edit-title').value = data.title || '';
    document.getElementById('edit-desc').value = lookup['description'] || '';
    document.getElementById('edit-og-title').value = lookup['og:title'] || '';
    document.getElementById('edit-og-desc').value = lookup['og:description'] || '';

    updateCount('edit-title', 'title-count', 60);
    updateCount('edit-desc', 'desc-count', 160);
    updateCount('edit-og-title', 'og-title-count', 90);
    updateCount('edit-og-desc', 'og-desc-count', 200);
  }

  function updateCount(inputId, countId, limit) {
    const input = document.getElementById(inputId);
    const counter = document.getElementById(countId);
    const update = () => {
      const len = input.value.length;
      counter.textContent = `${len} / ${limit}`;
      counter.classList.toggle('over', len > limit);
    };
    input.addEventListener('input', update);
    update();
  }

  // Save button
  document.getElementById('btn-save').addEventListener('click', () => {
    const title = document.getElementById('edit-title').value;
    const desc = document.getElementById('edit-desc').value;
    const ogTitle = document.getElementById('edit-og-title').value;
    const ogDesc = document.getElementById('edit-og-desc').value;

    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return;

      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: INJECT_FN,
        args: [title, desc, ogTitle, ogDesc]
      }, () => {
        const btn = document.getElementById('btn-save');
        const orig = btn.textContent;
        btn.textContent = '✓ Saved!';
        btn.disabled = true;
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
      });
    });
  });

  const INJECT_FN = (title, desc, ogTitle, ogDesc) => {
    // Update document title
    if (title) document.title = title;

    // Helper: set or create meta tag
    function setMeta(attr, key, content) {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    }

    if (desc) setMeta('name', 'description', desc);
    if (ogTitle) setMeta('property', 'og:title', ogTitle);
    if (ogDesc) setMeta('property', 'og:description', ogDesc);
  };

  // ── Helpers ──
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function truncate(s, n) { return s.length > n ? s.substring(0, n) + '…' : s; }

  function shortUrl(url) {
    try { return new URL(url).hostname + new URL(url).pathname.substring(0, 30); }
    catch { return url.substring(0, 50); }
  }
})();
