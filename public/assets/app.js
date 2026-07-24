/* ============================================================
   Air4 Daily Automotive Intelligence — Dashboard
   Vanilla JS, no dependencies.

   ความปลอดภัย: ข้อความทั้งหมดมาจากแหล่งภายนอก จึงสร้าง DOM ด้วย
   createElement/textContent เท่านั้น ไม่ใช้ innerHTML ที่ใดเลย
   ============================================================ */
(function (root) {
  'use strict';

  /* ---------------- helpers ---------------- */

  const $ = (id) => document.getElementById(id);

  function el(tag, opts, children) {
    const node = document.createElement(tag);
    if (opts) {
      if (opts.class) node.className = opts.class;
      if (opts.text != null) node.textContent = String(opts.text);
      if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) {
        if (v != null && v !== false) node.setAttribute(k, String(v));
      }
      if (opts.style) node.setAttribute('style', opts.style);
      if (opts.on) for (const [ev, fn] of Object.entries(opts.on)) node.addEventListener(ev, fn);
    }
    if (children) for (const c of children) { if (c) node.appendChild(c); }
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /** appendChild that tolerates null — builders return null for empty sections. */
  function add(parent, node) { if (node) parent.appendChild(node); return parent; }

  /** ลิงก์ภายนอก: เปิดแท็บใหม่ + noopener/noreferrer และรับเฉพาะ http(s) */
  function safeLink(url, label, cls) {
    let href = null;
    try {
      const u = new URL(String(url));
      if (u.protocol === 'http:' || u.protocol === 'https:') href = u.href;
    } catch (_) { /* ignore */ }
    if (!href) return el('span', { class: cls, text: label });
    return el('a', {
      class: cls, text: label,
      attrs: { href, target: '_blank', rel: 'noopener noreferrer' },
    });
  }

  const I18N = root.Air4I18n;
  const t = (k, vars) => I18N.t(k, vars);
  const VERDICT_TH = { get positive() { return t('verdict.positive'); }, get neutral() { return t('verdict.neutral'); }, get negative() { return t('verdict.negative'); } };
  const HORIZON_TH = new Proxy({}, { get: (_, k) => t('horizon.' + String(k)) });
  const CATEGORY_TH = new Proxy({}, { get: (_, k) => t('cat.' + String(k)) });
  const PRODUCT_TH = new Proxy({}, { get: (_, k) => t('prod.' + String(k)) });
  const OKR_TH = new Proxy({}, { get: (_, k) => t('okr.' + String(k)) });
  const STATUS_TH = new Proxy({}, { get: (_, k) => t('status.' + String(k)) });
  const DEADLINE_TH = new Proxy({}, { get: (_, k) => t('deadline.' + String(k)) });

  /** ปฏิทินไทย/สากลตามภาษาที่เลือก — เวลายังอิง Asia/Bangkok เสมอ */
  const locale = () => (I18N.getLang() === 'th' ? 'th-TH' : 'en-GB');

  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat(locale(), {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
      }).format(d);
    } catch (_) { return d.toISOString().slice(0, 16).replace('T', ' '); }
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(d);
    } catch (_) { return iso.slice(0, 10); }
  }

  const signed = (n) => (n > 0 ? '+' + n : String(n));


  /* ---------------- theme ---------------- */

  const THEME_KEY = 'air4.theme';

  function readTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (_) { return 'auto'; }
  }

  /** 'auto' = ปล่อยให้ prefers-color-scheme ตัดสิน */
  function applyTheme(mode) {
    if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
    try { localStorage.setItem(THEME_KEY, mode); } catch (_) { /* ignore */ }
    const btns = document.querySelectorAll('#themeSeg .seg__btn');
    for (const b of btns) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-choice') === mode));
    }
  }

  /* ---------------- toast ---------------- */

  let toastTimer = null;
  function toast(message) {
    const node = $('toast');
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    node.setAttribute('data-show', 'true');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.setAttribute('data-show', 'false');
      toastTimer = setTimeout(() => { node.hidden = true; }, 250);
    }, 2200);
  }

  /* ---------------- ภาษาของเนื้อหาข่าว ----------------
     บทวิเคราะห์ถูกสร้างเป็นภาษาไทยโดย AI จึงไม่มีฉบับอังกฤษ
     ในโหมด EN จะแสดง "หัวข้อต้นฉบับ" แทนหัวข้อที่แปลเป็นไทย
     ส่วนบทสรุปยังเป็นภาษาไทยและมีป้ายกำกับไว้ให้ผู้ใช้ทราบ */

  function displayTitle(i) {
    if (I18N.getLang() === 'en' && i.titleOriginal) return i.titleOriginal;
    return i.titleTh || i.titleOriginal || '';
  }

  function alternateTitle(i) {
    const primary = displayTitle(i);
    const other = I18N.getLang() === 'en' ? i.titleTh : i.titleOriginal;
    return other && other !== primary ? other : null;
  }

  function displaySummary(i) {
    return i.shortSummaryTh || i.originalSnippet || '';
  }

  /* ---------------- saved items ---------------- */

  const SAVED_KEY = 'air4.saved';

  function readSaved() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVED_KEY));
      return raw && typeof raw === 'object' ? raw : {};
    } catch (_) { return {}; }
  }

  function writeSaved(map) {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(map)); } catch (_) { /* โควตาเต็ม */ }
  }

  let savedMap = readSaved();

  const isSaved = (id) => Object.prototype.hasOwnProperty.call(savedMap, id);

  /* เก็บ "สำเนา" ของข่าวไว้ ไม่ใช่แค่ id
     เพราะข่าวที่บันทึกอาจอยู่นอกช่วงวันที่ที่เลือกอยู่ หรือถูกลบไปตามอายุข้อมูล 31 วัน
     ถ้าเก็บแค่ id รายการที่บันทึกไว้จะหายไปเอง */
  function toggleSave(item) {
    if (isSaved(item.id)) {
      delete savedMap[item.id];
    } else {
      savedMap[item.id] = { savedAt: new Date().toISOString(), item: item };
    }
    writeSaved(savedMap);
    updateSavedCount();
    if (state.filters.verdict === 'saved') renderNews();
  }

  function savedItems() {
    return Object.keys(savedMap)
      .map((k) => savedMap[k])
      .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
      .map((entry) => entry.item);
  }

  function updateSavedCount() {
    const n = Object.keys(savedMap).length;
    const badge = $('savedCount');
    if (badge) badge.textContent = n ? String(n) : '';
    const label = $('savedBarLabel');
    if (label) label.textContent = t('saved.count', { n: n });
  }

  const ICON = {
    bookmark: 'M6 3.8h12a1 1 0 0 1 1 1v15.4l-7-4.2-7 4.2V4.8a1 1 0 0 1 1-1Z',
    share: 'M14 9V5.5L20.5 12 14 18.5V15c-4.2 0-7 1.2-9 3.6.8-4.6 3.6-8.4 9-9.6Z',
  };

  function iconBtn(pathD, label, filled, onClick) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ico');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    svg.appendChild(path);

    const btn = el('button', {
      class: 'icobtn' + (filled ? ' is-on' : ''),
      attrs: { type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(!!filled) },
      on: { click: onClick },
    });
    btn.appendChild(svg);
    return btn;
  }

  function saveButton(i) {
    const on = isSaved(i.id);
    return iconBtn(ICON.bookmark, on ? t('card.unsave') : t('card.save'), on, (ev) => {
      ev.stopPropagation();
      toggleSave(i);
      const btn = ev.currentTarget;
      const nowOn = isSaved(i.id);
      btn.classList.toggle('is-on', nowOn);
      btn.setAttribute('aria-pressed', String(nowOn));
      const label = nowOn ? t('card.unsave') : t('card.save');
      btn.setAttribute('title', label);
      btn.setAttribute('aria-label', label);
    });
  }

  /** แชร์ลิงก์ต้นทางของข่าว — ใช้ Web Share API ถ้ามี ไม่งั้นคัดลอกลิงก์ */
  function shareButton(i) {
    return iconBtn(ICON.share, t('card.share'), false, async (ev) => {
      ev.stopPropagation();
      const url = i.sourceUrl || i.canonicalUrl;
      if (!url) return;
      const title = displayTitle(i);
      if (navigator.share) {
        try {
          await navigator.share({ title: title, url: url });
          return;
        } catch (_) {
          return; // ผู้ใช้กดยกเลิก — ไม่ต้องแจ้งอะไร
        }
      }
      const ok = await copyText(url);
      toast(ok ? t('card.shareCopied') : t('card.shareFailed'));
    });
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* ตกไปใช้วิธีสำรอง */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_) { return false; }
  }

  function exportSaved() {
    const items = savedItems();
    if (!items.length) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      count: items.length,
      items: items.map((i) => ({
        titleTh: i.titleTh,
        titleOriginal: i.titleOriginal,
        summaryTh: i.shortSummaryTh,
        classification: i.classification,
        impactScore: i.impactScore,
        sourceName: i.sourceName,
        publishedAt: i.publishedAt,
        url: i.sourceUrl || i.canonicalUrl,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { attrs: { href: url, download: 'air4-saved-' + new Date().toISOString().slice(0, 10) + '.json' } });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('saved.exported'));
  }

  async function copySavedLinks() {
    const items = savedItems();
    if (!items.length) return;
    const lines = items.map((i) => displayTitle(i) + '\n' + (i.sourceUrl || i.canonicalUrl));
    const ok = await copyText(lines.join('\n\n'));
    toast(ok ? t('saved.copied', { n: items.length }) : t('card.shareFailed'));
  }

  /* ---------------- state ---------------- */

  const state = {
    report: null,
    index: null,
    filters: {
      verdict: 'all', q: '', country: '', source: '', tier: '',
      category: '', channel: '', product: '', impact: 0, competitorOnly: false,
    },
  };

  /* ---------------- data loading ---------------- */

  async function fetchJson(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + path);
    return res.json();
  }

  /**
   * โหมดไฟล์เดียว (standalone): ข้อมูลถูกฝังไว้ในหน้าเว็บแล้ว
   * ใช้สำหรับส่งรายงานทางอีเมลหรือเปิดแบบออฟไลน์ — ไม่ต้องมีเซิร์ฟเวอร์
   */
  function readInline(id) {
    const node = document.getElementById(id);
    if (!node) return null;
    try {
      return JSON.parse(node.textContent);
    } catch (_) {
      return null;
    }
  }

  const INLINE_REPORT = readInline('inlineReport');
  const INLINE_INDEX = readInline('inlineIndex');
  const isStandalone = INLINE_REPORT !== null;

  /** แคชรายงานรายวันที่โหลดมาแล้ว เพื่อไม่ต้องดึงซ้ำเมื่อเปลี่ยนช่วง */
  const reportCache = new Map();

  async function fetchReport(date) {
    if (reportCache.has(date)) return reportCache.get(date);
    const r = await fetchJson('data/reports/' + encodeURIComponent(date) + '.json');
    reportCache.set(date, r);
    return r;
  }

  /** โหลดหลายวันพร้อมกันแบบจำกัดจำนวน request ที่ค้างพร้อมกัน */
  async function fetchReports(dates, concurrency) {
    const out = [];
    const queue = dates.slice();
    const workers = new Array(Math.min(concurrency || 6, queue.length))
      .fill(0)
      .map(async () => {
        while (queue.length) {
          const d = queue.shift();
          try {
            out.push(await fetchReport(d));
          } catch (_) {
            // วันที่โหลดไม่ได้ให้ข้ามไป ไม่ทำให้ทั้งช่วงล้ม
          }
        }
      });
    await Promise.all(workers);
    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  /** คำนวณช่วงวันที่จากตัวเลือกบนหน้าจอ */
  function resolveRange() {
    const days = (state.index && state.index.days) || [];
    if (!days.length) return null;
    const available = days.map((d) => d.date).sort().reverse();
    const preset = $('rangePreset').value;

    if (preset === 'latest') return [available[0]];
    if (preset === 'custom') {
      const from = $('dateFrom').value;
      const to = $('dateTo').value;
      if (!from || !to) return [available[0]];
      const lo = from <= to ? from : to;
      const hi = from <= to ? to : from;
      const picked = available.filter((d) => d >= lo && d <= hi);
      return picked.length ? picked : [available[0]];
    }
    const n = parseInt(preset, 10) || 1;
    return available.slice(0, n);
  }

  async function load() {
    if (isStandalone) {
      state.index = INLINE_INDEX || { days: [] };
      state.report = INLINE_REPORT;
      renderAll();
      $('loadState').hidden = true;
      $('content').hidden = false;
      // ไฟล์เดียวมีข้อมูลวันเดียว จึงปิดตัวเลือกที่ต้องโหลดเพิ่ม
      $('rangePreset').disabled = true;
      $('refreshBtn').hidden = true;
      return;
    }

    const loadState = $('loadState');
    loadState.hidden = false;
    loadState.textContent = t('state.loading');
    $('content').hidden = true;

    try {
      if (!state.index) {
        state.index = await fetchJson('data/index.json').catch(() => ({ days: [] }));
      }

      const dates = resolveRange();
      let reports;
      if (!dates) {
        reports = [await fetchJson('data/latest.json')];
      } else {
        if (dates.length > 1) {
          loadState.textContent = t('state.merging', { n: dates.length });
        }
        reports = await fetchReports(dates, 6);
        if (!reports.length) reports = [await fetchJson('data/latest.json')];
      }

      state.report = root.Air4Aggregate.aggregate(reports);

      renderAll();
      loadState.hidden = true;
      $('content').hidden = false;
    } catch (err) {
      loadState.hidden = false;
      clear(loadState);
      loadState.appendChild(el('strong', { text: t('state.noData') }));
      loadState.appendChild(el('span', {
        text: location.protocol === 'file:'
          ? t('state.needServer')
          : t('state.runDaily', { err: err.message }),
      }));
    }
  }

  /* ---------------- render: header + KPI ---------------- */

  function renderHeader() {
    const r = state.report;
    $('updatedAt').textContent = fmtDateTime(r.generatedAt);
    $('funnel').textContent = r.kpi.totalCollected + ' / ' + r.kpi.published;

    const pill = $('statusPill');
    pill.className = 'status status--' + r.status;
    $('statusText').textContent = STATUS_TH[r.status] || r.status;

    // ป้ายบอกช่วงวันที่ที่กำลังแสดง
    const label = $('rangeLabel');
    if (label) {
      label.textContent = r.isRange
        ? fmtDate(r.rangeFrom) + ' – ' + fmtDate(r.rangeTo) + ' (' + t('range.days', { n: r.rangeDays }) + ')'
        : fmtDate(r.date);
    }

    // ตั้งค่าเริ่มต้นของช่องวันที่แบบกำหนดเอง ให้อยู่ในกรอบข้อมูลที่มีจริง
    const days = (state.index && state.index.days) || [];
    if (days.length) {
      const all = days.map((d) => d.date).sort();
      const from = $('dateFrom');
      const to = $('dateTo');
      [from, to].forEach((input) => {
        input.min = all[0];
        input.max = all[all.length - 1];
      });
      if (!from.value) from.value = r.isRange ? r.rangeFrom : all[0];
      if (!to.value) to.value = r.isRange ? r.rangeTo : all[all.length - 1];
    }
  }

  function kpiCard(label, value, foot, tone) {
    return el('div', { class: 'kpi' + (tone ? ' kpi--' + tone : '') }, [
      el('div', { class: 'kpi__label', text: label }),
      el('div', { class: 'kpi__value num', text: String(value) }),
      foot ? el('div', { class: 'kpi__foot', text: foot }) : null,
    ]);
  }

  function renderKpis() {
    const r = state.report;
    const k = r.kpi;
    const box = $('kpis');
    clear(box);
    [
      kpiCard(r.isRange ? t('kpi.total') : t('kpi.totalToday'), k.published,
        r.isRange ? t('kpi.rangeFoot', { n: r.rangeDays }) : t('kpi.totalFoot', { n: k.totalCollected })),
      kpiCard(t('kpi.positive'), k.positive, t('kpi.positiveFoot'), 'pos'),
      kpiCard(t('kpi.neutral'), k.neutral, t('kpi.neutralFoot'), 'neu'),
      kpiCard(t('kpi.negative'), k.negative, t('kpi.negativeFoot'), 'neg'),
      kpiCard(t('kpi.highImpact'), k.highImpact, t('kpi.highImpactFoot')),
      kpiCard(t('kpi.competitor'), k.competitorAlerts, t('kpi.competitorFoot')),
      kpiCard(t('kpi.ev'), k.evRelated, t('kpi.evFoot')),
      kpiCard(t('kpi.intl'), k.international, t('kpi.intlFoot')),
      kpiCard(t('kpi.b2b'), k.b2bOpportunities, t('kpi.b2bFoot')),
      kpiCard(t('kpi.o2'), k.o2Supporting, t('kpi.o2Foot')),
      kpiCard(t('kpi.social'), k.socialMentions || 0, t('kpi.socialFoot')),
      kpiCard(t('kpi.signal'), k.demandSignals || 0, t('kpi.signalFoot')),
    ].forEach((c) => box.appendChild(c));
  }

  /* ---------------- render: briefing ---------------- */

  /**
   * บทวิเคราะห์รายวัน (สรุปผู้บริหาร / แผนงาน) เขียนขึ้นสำหรับ "วันเดียว"
   * เมื่อผู้ใช้เลือกดูเป็นช่วง จึงยังคงแสดงของวันล่าสุด และติดป้ายบอกให้ชัด
   * ไม่นำมาเฉลี่ยหรือรวมกัน เพราะจะทำให้ข้อเสนอแนะเพี้ยน
   */
  function narrativeScopeText(fallback) {
    const r = state.report;
    return r.isRange
      ? t('brief.scopeNote', { date: fmtDate(r.narrativeFromDate) })
      : fallback;
  }

  function renderBriefing() {
    const d = state.report.daily;
    $('execSummary').textContent = d.executiveSummaryTh;

    const net = Number(d.netImpactScore) || 0;
    $('netScore').textContent = signed(net.toFixed(1));
    const clamped = Math.max(-5, Math.min(5, net));
    const pin = $('netPin');
    pin.style.left = ((clamped + 5) / 10) * 100 + '%';
    pin.style.background =
      d.overallSentiment === 'positive' ? 'var(--pos)'
      : d.overallSentiment === 'negative' ? 'var(--neg)' : 'var(--neu)';

    $('urgency').textContent =
      t('brief.overall') + ': ' + VERDICT_TH[d.overallSentiment] + ' · ' + t('urgency.' + d.urgencyLevel);

    const ai = state.report.ai;
    $('briefBy').textContent = state.report.isRange
      ? narrativeScopeText('')
      : ai.enabled
      ? t('brief.byAi', { model: ai.model, n: ai.itemsAnalyzedByAi })
      : t('brief.byRule');

    fillSignals($('opportunities'), d.opportunitySignals, t('brief.oppEmpty'));
    fillSignals($('risks'), d.riskSignals, t('brief.riskEmpty'));

    // OKR
    const okr = d.okrAssessment;
    const okrBox = $('okrBox');
    clear(okrBox);
    add(okrBox, el('article', { class: 'card action-col' }, [
      el('div', { class: 'action-col__head' }, [el('span', { text: t('okrBox.O1') })]),
      el('p', { class: 'action__why', text: okr.O1 }),
      chipsRow('ช่องทางที่ได้ประโยชน์', okr.benefitingChannels),
    ]));
    add(okrBox, el('article', { class: 'card action-col' }, [
      el('div', { class: 'action-col__head' }, [el('span', { text: t('okrBox.O2') })]),
      el('p', { class: 'action__why', text: okr.O2 }),
      chipsRow('ช่องทางที่มีความเสี่ยง', okr.atRiskChannels),
    ]));
    if (okr.prioritisationNote) {
      add(okrBox, el('article', { class: 'card action-col' }, [
        el('div', { class: 'action-col__head' }, [el('span', { text: t('okrBox.questions') })]),
        el('ul', { class: 'dblock' }, (d.ceoQuestions || []).map((q) => el('li', { text: q }))),
        el('p', { class: 'action__why', text: okr.prioritisationNote }),
      ]));
    }
  }

  function chipsRow(label, values) {
    const list = (values || []).filter(Boolean);
    if (!list.length) return null;
    return el('div', { class: 'action__foot' },
      [el('span', { class: 'kpi__foot', text: label + ':' })].concat(
        list.map((v) => el('span', { class: 'tag', text: v })),
      ));
  }

  function fillSignals(ul, list, emptyMsg) {
    clear(ul);
    if (!list || !list.length) {
      ul.appendChild(el('li', { class: 'signal__empty', text: emptyMsg }));
      return;
    }
    list.forEach((s) => {
      ul.appendChild(el('li', {}, [
        el('b', { text: s.title }),
        el('span', { text: s.detail }),
      ]));
    });
  }

  /* ---------------- render: actions ---------------- */

  function actionColumn(title, list) {
    const col = el('article', { class: 'card action-col' }, [
      el('div', { class: 'action-col__head' }, [
        el('span', { text: title }),
        el('span', { class: 'action-col__count', text: String((list || []).length) }),
      ]),
    ]);
    if (!list || !list.length) {
      col.appendChild(el('p', { class: 'signal__empty', text: t('act.emptyFrame') }));
      return col;
    }
    list.forEach((a) => {
      const foot = el('div', { class: 'action__foot' }, [
        el('span', { class: 'tag tag--owner', text: a.owner }),
        el('span', {
          class: 'tag' + (a.priority === 'high' ? ' tag--high' : a.priority === 'medium' ? ' tag--medium' : ''),
          text: t('act.priority') + ': ' + t('priority.' + a.priority),
        }),
      ]);
      (a.relatedNewsIds || []).slice(0, 2).forEach((id) => {
        const item = state.report.items.find((i) => i.id === id);
        if (item) {
          foot.appendChild(el('button', {
            class: 'tag', text: t('act.sourceNews'),
            attrs: { type: 'button' },
            on: { click: () => openDrawer(item) },
          }));
        }
      });
      col.appendChild(el('div', { class: 'action' }, [
        el('div', { class: 'action__what', text: a.action }),
        a.reason ? el('div', { class: 'action__why', text: a.reason }) : null,
        foot,
      ]));
    });
    return col;
  }

  function renderActions() {
    const d = state.report.daily;
    const box = $('actions');
    clear(box);
    box.appendChild(actionColumn('ทำวันนี้', d.actionsToday));
    box.appendChild(actionColumn('ภายใน 7 วัน', d.actionsWithin7Days));
    box.appendChild(actionColumn('ติดตามต่อ', d.actionsToMonitor));
    $('actNote').textContent = narrativeScopeText(t('act.note'));
  }

  /* ---------------- render: charts ---------------- */

  function barChart(title, rows, color) {
    const card = el('article', { class: 'card chart' }, [el('h3', { class: 'chart__title', text: title })]);
    const max = Math.max(1, ...rows.map((r) => r.value));
    if (!rows.length) {
      add(card, el('p', { class: 'chart__empty', text: t('chart.empty') }));
      return card;
    }
    rows.forEach((r) => {
      add(card, el('div', { class: 'bar-row' }, [
        el('span', { class: 'bar-row__label', text: r.label, attrs: { title: r.label } }),
        el('span', { class: 'bar-row__track' }, [
          el('span', {
            class: 'bar-row__fill',
            style: 'width:' + (r.value / max) * 100 + '%' + (r.color || color ? ';background:' + (r.color || color) : ''),
          }),
        ]),
        el('span', { class: 'bar-row__val', text: String(r.value) }),
      ]));
    });
    return card;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v));
    return n;
  }

  /** Net-impact trend — plotted on the same −5…+5 axis as the ruler above */
  function trendChart(days) {
    const card = el('article', { class: 'card chart' }, [
      el('h3', { class: 'chart__title', text: t('chart.trend') }),
    ]);
    const pts = days.slice(0, 7).reverse();
    if (pts.length < 2) {
      add(card, el('p', { class: 'chart__empty', text: t('chart.trendNeed') }));
      return card;
    }

    const W = 320, H = 130, PAD = 22;
    const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    svg.appendChild(svgEl('title', {})).textContent = 'แนวโน้มคะแนนผลกระทบสุทธิ 7 วัน';

    const lo = -5, hi = 5;
    const x = (i) => PAD + (i * (W - PAD * 2)) / (pts.length - 1);
    const y = (v) => {
      const c = Math.max(lo, Math.min(hi, v));
      return PAD + ((hi - c) / (hi - lo)) * (H - PAD * 2);
    };

    svg.appendChild(svgEl('line', {
      class: 'trend__zero', x1: PAD, x2: W - PAD, y1: y(0), y2: y(0),
    }));

    let path = '';
    pts.forEach((p, i) => { path += (i === 0 ? 'M' : 'L') + x(i) + ' ' + y(p.netImpactScore || 0); });
    svg.appendChild(svgEl('path', { class: 'trend__line', d: path }));

    pts.forEach((p, i) => {
      const v = p.netImpactScore || 0;
      const tone = v >= 2 ? 'pos' : v <= -2 ? 'neg' : 'neu';
      const isLast = i === pts.length - 1;
      svg.appendChild(svgEl('circle', {
        class: 'trend__dot trend__dot--' + tone + (isLast ? ' trend__dot--last' : ''),
        cx: x(i), cy: y(v),
      }));
      const label = svgEl('text', {
        class: 'trend__label', x: x(i), y: H - 4, 'text-anchor': 'middle',
      });
      label.textContent = p.date.slice(5);
      svg.appendChild(label);
    });

    [hi, 0, lo].forEach((v) => {
      const t = svgEl('text', { class: 'trend__label', x: 2, y: y(v) + 3 });
      t.textContent = signed(v);
      svg.appendChild(t);
    });

    card.appendChild(svg);
    return card;
  }

  function tally(items, keyFn) {
    const map = new Map();
    items.forEach((i) => {
      const keys = keyFn(i);
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
        if (k == null || k === '') return;
        map.set(k, (map.get(k) || 0) + 1);
      });
    });
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }

  function renderCharts() {
    const items = state.report.items;
    const k = state.report.kpi;
    const box = $('charts');
    clear(box);

    box.appendChild(barChart('สัดส่วนประเภทข่าว', [
      { label: 'เชิงบวก', value: k.positive, color: 'var(--pos)' },
      { label: 'เป็นกลาง', value: k.neutral, color: 'var(--neu)' },
      { label: 'เชิงลบ', value: k.negative, color: 'var(--neg)' },
    ]));

    box.appendChild(trendChart((state.index && state.index.days) || []));

    box.appendChild(barChart('ข่าวแยกตามช่องทาง', tally(items, (i) => i.affectedChannels)));
    box.appendChild(barChart('ข่าวแยกตามผลิตภัณฑ์',
      tally(items, (i) => (i.affectedProducts || []).map((p) => PRODUCT_TH[p] || p))));
    box.appendChild(barChart('ข่าวแยกตามประเทศ', tally(items, (i) => i.affectedCountries)));
    box.appendChild(barChart('การกล่าวถึงคู่แข่ง', tally(items, (i) => i.affectedCompetitors)));
  }

  /* ---------------- render: filters + news ---------------- */

  function fillSelect(sel, values, allLabel) {
    const current = sel.value;
    clear(sel);
    sel.appendChild(el('option', { text: allLabel, attrs: { value: '' } }));
    values.forEach((v) => sel.appendChild(el('option', { text: v.label, attrs: { value: v.value } })));
    if (values.some((v) => v.value === current)) sel.value = current;
  }

  function buildFilterOptions() {
    const items = state.report.items;
    const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();

    fillSelect($('fCountry'),
      uniq(items.flatMap((i) => i.affectedCountries)).map((c) => ({ value: c, label: c })),
      'ทุกประเทศ');
    fillSelect($('fSource'),
      uniq(items.map((i) => i.sourceName)).map((s) => ({ value: s, label: s })),
      'ทุกแหล่งข่าว');
    fillSelect($('fCategory'),
      uniq(items.map((i) => i.newsCategory)).map((c) => ({ value: c, label: CATEGORY_TH[c] || c })),
      'ทุกหมวดข่าว');
  }

  function applyFilters() {
    const f = state.filters;
    const q = f.q.trim().toLowerCase();
    /* รายการที่บันทึกไว้มาจาก localStorage ไม่ใช่รายงานของช่วงที่เลือก
       จึงยังเปิดดูได้แม้ข่าวนั้นจะอยู่นอกช่วงหรือถูกลบไปตามอายุข้อมูลแล้ว */
    const pool = f.verdict === 'saved' ? savedItems() : state.report.items;
    return pool.filter((i) => {
      if (f.verdict !== 'all' && f.verdict !== 'saved' && i.classification !== f.verdict) return false;
      if (f.country && !(i.affectedCountries || []).includes(f.country)) return false;
      if (f.source && i.sourceName !== f.source) return false;
      if (f.tier && String(i.sourceTier) !== f.tier) return false;
      if (f.category && i.newsCategory !== f.category) return false;
      if (f.channel && !(i.affectedChannels || []).includes(f.channel)) return false;
      if (f.product && !(i.affectedProducts || []).includes(f.product)) return false;
      if (f.impact && Math.abs(i.impactScore) < f.impact) return false;
      if (f.competitorOnly && !(i.affectedCompetitors || []).length) return false;
      if (q) {
        const hay = [
          i.titleTh, i.titleOriginal, i.shortSummaryTh, i.sourceName,
          (i.affectedCompetitors || []).join(' '), (i.reasoningSummary || []).join(' '),
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function newsCard(i) {
    const card = el('article', { class: 'item item--' + i.classification });

    add(card, el('div', { class: 'item__top' }, [
      el('span', { class: 'verdict verdict--' + i.classification, text: VERDICT_TH[i.classification] }),
      el('span', { class: 'score', attrs: { title: t('card.impactTitle') }, text: t('card.impact') + ' ' + signed(i.impactScore) }),
      el('span', { class: 'item__conf', text: t('card.confidence') + ' ' + i.confidence + '%' }),
    ]));

    add(card, el('h3', { class: 'item__title', text: displayTitle(i) }));
    const altTitle = alternateTitle(i);
    if (altTitle) add(card, el('div', { class: 'item__orig', text: altTitle }));

    const meta = el('div', { class: 'item__meta' }, [
      el('span', { text: i.sourceName }),
      el('span', { text: '· ' + (i.sourceCountry || '—') }),
      el('span', { text: '· ' + fmtDate(i.publishedAt) }),
      el('span', { text: '· Tier ' + i.sourceTier }),
    ]);
    if (i.unverified || i.sourceTier === 3) meta.appendChild(el('span', { class: 'flag', text: t('flag.unverified') }));
    if (i.itemKind === 'social') meta.appendChild(el('span', { class: 'flag flag--social', text: t('flag.social') }));
    if (i.itemKind === 'signal') meta.appendChild(el('span', { class: 'flag flag--signal', text: t('flag.signal') }));
    // ข่าวที่ปรากฏหลายวันในช่วงที่เลือก
    if (i.reportDates && i.reportDates.length > 1) {
      meta.appendChild(el('span', { class: 'flag', text: t('flag.multiDay', { n: i.reportDates.length }) }));
    }
    if (i.isPressRelease) meta.appendChild(el('span', { class: 'flag', text: t('flag.pressRelease') }));
    if (i.isSponsored) meta.appendChild(el('span', { class: 'flag', text: t('flag.sponsored') }));
    if (i.analyzedBy === 'fallback') meta.appendChild(el('span', { class: 'flag', text: t('flag.ruleBased') }));
    card.appendChild(meta);

    add(card, el('p', { class: 'item__summary', text: displaySummary(i) }));

    if ((i.reasoningSummary || []).length) {
      add(card, el('div', { class: 'item__why' }, [
        el('b', { text: t('card.why') }),
        el('span', { text: i.reasoningSummary.join(' · ') }),
      ]));
    }

    const tags = el('div', { class: 'item__tags' });
    (i.affectedChannels || []).forEach((c) => tags.appendChild(el('span', { class: 'tag', text: c })));
    (i.affectedProducts || []).forEach((p) => tags.appendChild(el('span', { class: 'tag', text: PRODUCT_TH[p] || p })));
    (i.affectedCompetitors || []).forEach((c) => tags.appendChild(el('span', { class: 'tag tag--high', text: t('card.competitorTag') + c })));
    if (i.okrImpact) {
      if (i.okrImpact.O1 !== 'neutral') tags.appendChild(el('span', { class: 'tag', text: 'O1 ' + OKR_TH[i.okrImpact.O1] }));
      if (i.okrImpact.O2 !== 'neutral') tags.appendChild(el('span', { class: 'tag', text: 'O2 ' + OKR_TH[i.okrImpact.O2] }));
    }
    if (tags.childNodes.length) card.appendChild(tags);

    add(card, el('div', { class: 'item__actions' }, [
      el('button', {
        class: 'btn btn--primary', text: t('card.details'),
        attrs: { type: 'button' }, on: { click: () => openDrawer(i) },
      }),
      safeLink(i.sourceUrl, t('card.openSource'), 'btn'),
      el('span', { class: 'item__actions-spacer' }),
      saveButton(i),
      shareButton(i),
    ]));

    return card;
  }

  function renderNews() {
    const list = applyFilters();
    const grid = $('newsGrid');
    clear(grid);
    const isSavedView = state.filters.verdict === 'saved';
    const total = isSavedView ? Object.keys(savedMap).length : state.report.items.length;
    $('resultCount').textContent = t('filter.count', { shown: list.length, total: total });
    $('savedBar').hidden = !isSavedView;
    $('newsEmptyTitle').textContent = isSavedView ? t('filter.savedEmptyTitle') : t('filter.emptyTitle');
    $('newsEmptyHint').textContent = isSavedView ? t('filter.savedEmptyHint') : t('filter.emptyHint');
    $('newsEmpty').hidden = list.length > 0;
    list.forEach((i) => grid.appendChild(newsCard(i)));
  }

  /* ---------------- render: drawer ---------------- */

  let lastFocused = null;

  function dblock(title, node, cls) {
    if (!node) return null;
    return el('section', { class: 'dblock' + (cls ? ' ' + cls : '') }, [
      el('h3', { class: 'dblock__title', text: title }),
      node,
    ]);
  }

  function bulletList(arr) {
    if (!arr || !arr.length) return null;
    return el('ul', {}, arr.map((t) => el('li', { text: t })));
  }

  function openDrawer(item) {
    lastFocused = document.activeElement;
    $('drawerTitle').textContent = item.titleTh;
    const body = $('drawerBody');
    clear(body);

    const facts = el('div', { class: 'dgrid' }, [
      el('div', {}, [el('dt', { text: t('drawer.type') }), el('dd', { text: VERDICT_TH[item.classification] })]),
      el('div', {}, [el('dt', { text: t('drawer.score') }), el('dd', { class: 'num', text: signed(item.impactScore) })]),
      el('div', {}, [el('dt', { text: t('drawer.confidence') }), el('dd', { class: 'num', text: item.confidence + '%' })]),
      el('div', {}, [el('dt', { text: t('drawer.relevance') }), el('dd', { class: 'num', text: item.relevanceScore + '/100' })]),
      el('div', {}, [el('dt', { text: t('drawer.horizon') }), el('dd', { text: HORIZON_TH[item.timeHorizon] || item.timeHorizon })]),
      el('div', {}, [el('dt', { text: t('drawer.category') }), el('dd', { text: CATEGORY_TH[item.newsCategory] || item.newsCategory })]),
    ]);
    add(body, dblock('ข้อมูลสรุป', facts));

    add(body, dblock('สรุปข่าว', el('p', { text: item.shortSummaryTh })));

    if (item.titleOriginal && item.titleOriginal !== item.titleTh) {
      add(body, dblock('ชื่อข่าวต้นฉบับ', el('p', { text: item.titleOriginal })));
    }

    add(body, dblock('ผลดีที่อาจเกิดขึ้น', bulletList(item.positiveImpacts), 'dblock--pos'));
    add(body, dblock('ผลเสียที่อาจเกิดขึ้น', bulletList(item.negativeImpacts), 'dblock--neg'));

    if (item.businessInterpretation) {
      add(body, dblock('การตีความเชิงธุรกิจ', el('p', { text: item.businessInterpretation })));
    }

    if (item.okrImpact) {
      add(body, dblock('ผลกระทบต่อ OKRs', el('div', { class: 'dgrid' }, [
        el('div', {}, [el('dt', { text: t('drawer.o1') }), el('dd', { text: OKR_TH[item.okrImpact.O1] })]),
        el('div', {}, [el('dt', { text: t('drawer.o2') }), el('dd', { text: OKR_TH[item.okrImpact.O2] })]),
      ])));
    }

    if ((item.recommendedActions || []).length) {
      const acts = el('div', {});
      item.recommendedActions.forEach((a) => {
        acts.appendChild(el('div', { class: 'action' }, [
          el('div', { class: 'action__what', text: a.action }),
          el('div', { class: 'action__foot' }, [
            el('span', { class: 'tag tag--owner', text: a.owner }),
            el('span', { class: 'tag' + (a.priority === 'high' ? ' tag--high' : ''), text: t('act.priority') + ': ' + t('priority.' + a.priority) }),
            el('span', { class: 'tag', text: DEADLINE_TH[a.deadline] || a.deadline }),
          ]),
        ]));
      });
      add(body, dblock('สิ่งที่แนะนำให้ทำ', acts));
    }

    const cred = el('p', {
      text: t('source.label', { name: item.sourceName, tier: item.sourceTier })
        + (item.sourceTier === 1 ? ' — แหล่งข้อมูลทางการ'
          : item.sourceTier === 2 ? ' — สำนักข่าว'
          : ' — ข้อมูลตลาด/โซเชียล ยังต้องตรวจสอบก่อนใช้อ้างอิง')
        + ' · เผยแพร่ ' + fmtDate(item.publishedAt),
    });
    add(body, dblock('ความน่าเชื่อถือของแหล่งข่าว', cred));

    if ((item.relatedCoverage || []).length) {
      const rel = el('div', { class: 'related' });
      item.relatedCoverage.forEach((r) => rel.appendChild(safeLink(r.url, r.sourceName + ' (Tier ' + r.tier + ')')));
      add(body, dblock('ข่าวเดียวกันจากแหล่งอื่น', rel));
    }

    body.appendChild(el('div', { class: 'item__actions' }, [
      safeLink(item.sourceUrl, 'เปิดข่าวต้นฉบับ', 'btn btn--primary'),
    ]));

    $('drawer').setAttribute('data-open', 'true');
    $('drawer').setAttribute('aria-hidden', 'false');
    $('scrim').setAttribute('data-open', 'true');
    $('drawerClose').focus();
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    $('drawer').setAttribute('data-open', 'false');
    $('drawer').setAttribute('aria-hidden', 'true');
    $('scrim').setAttribute('data-open', 'false');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  /* ---------------- render: system status ---------------- */

  function renderHealth() {
    const r = state.report;
    const box = $('health');
    clear(box);
    (r.sourceHealth || []).forEach((h) => {
      box.appendChild(el('div', { class: 'health__item', attrs: { title: h.error || '' } }, [
        el('span', { class: 'health__dot health__dot--' + (h.ok ? 'ok' : 'bad') }),
        el('span', { class: 'health__name', text: h.sourceName }),
        el('span', { class: 'health__count', text: h.ok ? String(h.itemCount) : t('sys.failed') }),
      ]));
    });

    $('aiNote').textContent = r.ai.enabled
      ? t('sys.aiOn', {
          model: r.ai.model,
          tokens: (r.ai.inputTokens + r.ai.outputTokens).toLocaleString(),
          cost: r.ai.estimatedCostUsd.toFixed(3),
        })
      : t('sys.aiOff');

    const errBox = $('errorBox');
    clear(errBox);
    if ((r.errors || []).length) {
      const det = el('details', { class: 'card', style: 'margin-top:12px;padding:12px 16px' });
      det.appendChild(el('summary', {
        text: t('sys.errors', { n: r.errors.length }),
        style: 'cursor:pointer;font-size:13px;color:var(--ink-2)',
      }));
      det.appendChild(el('ul', { style: 'font-size:12px;color:var(--ink-3);margin:8px 0 0' },
        r.errors.map((e) => el('li', { text: e }))));
      errBox.appendChild(det);
    }
  }

  /* ---------------- wiring ---------------- */

  function renderAll() {
    renderHeader();
    renderKpis();
    renderBriefing();
    renderActions();
    renderCharts();
    buildFilterOptions();
    renderNews();
    renderHealth();
  }

  function bind() {
    $('verdictChips').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      state.filters.verdict = btn.dataset.verdict;
      [...$('verdictChips').children].forEach((c) =>
        c.setAttribute('aria-pressed', String(c === btn)));
      renderNews();
    });

    let searchTimer;
    $('searchBox').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      const v = e.target.value;
      searchTimer = setTimeout(() => { state.filters.q = v; renderNews(); }, 180);
    });

    const selectMap = {
      fCountry: 'country', fSource: 'source', fTier: 'tier',
      fCategory: 'category', fChannel: 'channel', fProduct: 'product',
    };
    Object.entries(selectMap).forEach(([id, key]) => {
      $(id).addEventListener('change', (e) => { state.filters[key] = e.target.value; renderNews(); });
    });
    $('fImpact').addEventListener('change', (e) => {
      state.filters.impact = Number(e.target.value) || 0; renderNews();
    });
    $('fCompetitor').addEventListener('change', (e) => {
      state.filters.competitorOnly = e.target.checked; renderNews();
    });

    $('resetFilters').addEventListener('click', () => {
      state.filters = {
        verdict: 'all', q: '', country: '', source: '', tier: '',
        category: '', channel: '', product: '', impact: 0, competitorOnly: false,
      };
      $('searchBox').value = '';
      ['fCountry', 'fSource', 'fTier', 'fCategory', 'fChannel', 'fProduct'].forEach((id) => { $(id).value = ''; });
      $('fImpact').value = '0';
      $('fCompetitor').checked = false;
      [...$('verdictChips').children].forEach((c) =>
        c.setAttribute('aria-pressed', String(c.dataset.verdict === 'all')));
      renderNews();
    });

    $('rangePreset').addEventListener('change', () => {
      const custom = $('rangePreset').value === 'custom';
      $('customFrom').hidden = !custom;
      $('customTo').hidden = !custom;
      load();
    });
    $('dateFrom').addEventListener('change', () => load());
    $('dateTo').addEventListener('change', () => load());
    $('refreshBtn').addEventListener('click', () => {
      state.index = null;
      reportCache.clear();
      load();
    });

    // ธีม
    document.querySelectorAll('#themeSeg .seg__btn').forEach((btn) => {
      btn.addEventListener('click', () => applyTheme(btn.getAttribute('data-theme-choice')));
    });

    // ภาษา — เปลี่ยนแล้ววาดใหม่ทั้งหน้า (ข้อมูลเดิม ไม่ต้องโหลดซ้ำ)
    document.querySelectorAll('#langSeg .seg__btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        I18N.setLang(btn.getAttribute('data-lang-choice'));
        applyLanguage();
      });
    });

    // รายการที่บันทึกไว้
    $('savedExport').addEventListener('click', exportSaved);
    $('savedCopy').addEventListener('click', copySavedLinks);
    $('savedClear').addEventListener('click', () => {
      if (!Object.keys(savedMap).length) return;
      if (!window.confirm(t('saved.clearConfirm'))) return;
      savedMap = {};
      writeSaved(savedMap);
      updateSavedCount();
      renderNews();
    });

    $('drawerClose').addEventListener('click', closeDrawer);
    $('scrim').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('drawer').getAttribute('data-open') === 'true') closeDrawer();
    });
  }

  /** ใช้ภาษาที่เลือกกับทั้งหน้า: ข้อความคงที่ + ส่วนที่วาดด้วย JS */
  function applyLanguage() {
    const lang = I18N.getLang();
    I18N.applyStatic(document);
    document.title = t('doc.title');
    document.querySelectorAll('#langSeg .seg__btn').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang-choice') === lang));
    });
    updateSavedCount();
    if (state.report) renderAll();
  }

  applyTheme(readTheme());
  I18N.setLang(I18N.getLang());
  applyLanguage();
  bind();
  load();
})(typeof globalThis !== 'undefined' ? globalThis : this);
