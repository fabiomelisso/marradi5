/* Marradi 5 — disponibilità e tariffe
   Motore tariffario lato client: legge data/tariffe.json, data/eventi.json e
   data/disponibilita.json, calcola il prezzo di ogni notte e il preventivo. */
(function () {
  'use strict';

  const section = document.getElementById('tariffe');
  if (!section) return;

  const $ = sel => section.querySelector(sel);
  const grid = $('#calGrid');
  const monthLabel = $('#calMonth');
  const quoteBox = $('#quote');
  const guestsSel = $('#quoteGuests');
  const bestTable = $('#bestRates');
  const legendEvents = $('#eventList');

  const DAY = 86400000;
  const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const DOW_KEYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const fmtEur = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  const fmtEur2 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const fmtDate = d => d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  const iso = d => d.toISOString().slice(0, 10);
  const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return utc(y, m - 1, d); };
  const today = (() => { const n = new Date(); return utc(n.getFullYear(), n.getMonth(), n.getDate()); })();

  let cfg = null, eventi = [], bloccati = [];
  let view = utc(today.getUTCFullYear(), today.getUTCMonth(), 1);
  let checkIn = null, checkOut = null;

  Promise.all([
    fetch('data/tariffe.json').then(r => r.json()),
    fetch('data/eventi.json').then(r => r.json()).catch(() => []),
    fetch('data/disponibilita.json').then(r => r.json()).catch(() => ({ bloccati: [] }))
  ]).then(([t, e, d]) => {
    cfg = t;
    eventi = (Array.isArray(e) ? e : []).map(ev => ({ ...ev, _da: parse(ev.inizio), _a: parse(ev.fine) }));
    bloccati = (d.bloccati || []).map(b => ({ _da: parse(b.da), _a: parse(b.a) }));
    init();
  }).catch(err => {
    console.error('Tariffe non caricate', err);
    section.querySelector('.rates__fallback').hidden = false;
  });

  /* ---------- Regole di prezzo ---------- */
  function inRange(d, da, a) { return d >= da && d <= a; }

  // Stagioni definite su "MM-DD"; gestisce anche intervalli a cavallo dell'anno.
  function seasonFor(d) {
    const md = iso(d).slice(5);
    for (const s of cfg.stagioni) {
      if (s.da <= s.a ? (md >= s.da && md <= s.a) : (md >= s.da || md <= s.a)) return s;
    }
    return { nome: 'Standard', moltiplicatore: 1 };
  }

  function eventsFor(d) { return eventi.filter(ev => inRange(d, ev._da, ev._a)); }
  function isBlocked(d) { return bloccati.some(b => inRange(d, b._da, b._a)); }

  function nightlyPrice(d) {
    const season = seasonFor(d);
    const dow = cfg.giorni_settimana[DOW_KEYS[d.getUTCDay()]] || 1;
    const evs = eventsFor(d);
    const evMult = evs.length ? Math.max(...evs.map(e => e.moltiplicatore || 1)) : 1;
    let p = cfg.base * season.moltiplicatore * dow * evMult;
    p = Math.min(Math.max(p, cfg.base * cfg.pavimento_pct), cfg.base * cfg.tetto_pct);
    const step = cfg.arrotonda_a || 1;
    return { price: Math.round(p / step) * step, season, events: evs };
  }

  // Soggiorno minimo: più alto in eventi e alta stagione, si riduce a ridosso della data
  // (così le notti vicine non restano vuote) e per le "notti orfane" tra due prenotazioni.
  function minStayFor(d) {
    if (eventsFor(d).length) return cfg.soggiorno_minimo_eventi;
    let min = seasonFor(d).moltiplicatore > 1.05 && cfg.soggiorno_minimo_alta ? cfg.soggiorno_minimo_alta : cfg.soggiorno_minimo;
    const lead = Math.round((d - today) / DAY);
    (cfg.soggiorno_minimo_riduzione || []).forEach(r => { if (lead <= r.entro_giorni) min = Math.min(min, r.minimo); });
    const gap = orphanGap(d);
    if (gap) min = Math.min(min, gap);
    return min;
  }

  // Se la notte è in un buco di 1-2 notti tra periodi bloccati (o fra oggi e un blocco),
  // restituisce la lunghezza del buco; altrimenti 0.
  function orphanGap(d) {
    const o = cfg.notti_orfane; if (!o || isBlocked(d)) return 0;
    let start = new Date(d), end = new Date(d), len = 1;
    while (len <= o.max_notti) {
      const prev = new Date(start.getTime() - DAY);
      if (prev < today || isBlocked(prev)) break;
      start = prev; len++;
    }
    while (len <= o.max_notti) {
      const next = new Date(end.getTime() + DAY);
      if (isBlocked(next)) break;
      end = next; len++;
      if (len > o.max_notti) return 0;
    }
    // Chiuso da entrambi i lati?
    const before = new Date(start.getTime() - DAY), after = new Date(end.getTime() + DAY);
    const closedBefore = before < today || isBlocked(before);
    const closedAfter = isBlocked(after);
    return (closedBefore && closedAfter && len <= o.max_notti) ? len : 0;
  }

  /* ---------- Preventivo ---------- */
  function quote(ci, co, guests) {
    const nights = Math.round((co - ci) / DAY);
    if (nights <= 0) return null;
    const rows = [];
    let subtotal = 0, hasEvent = false, maxMin = cfg.soggiorno_minimo;
    for (let d = new Date(ci); d < co; d = new Date(d.getTime() + DAY)) {
      if (isBlocked(d) || d < today) return { error: 'Una o più notti selezionate non sono disponibili.' };
      const n = nightlyPrice(d);
      subtotal += n.price;
      if (n.events.length) hasEvent = true;
      maxMin = Math.max(maxMin, minStayFor(d));
      rows.push({ date: d, ...n });
    }
    if (nights < maxMin) return { error: `Per queste date il soggiorno minimo è di ${maxMin} notti.` };

    const s = cfg.sconti;
    const candidates = [];
    const durationOk = !(s.durata_non_in_eventi && hasEvent);
    if (durationOk) {
      if (s.mensile && nights >= s.mensile.notti_min) candidates.push([s.mensile.pct, 'Sconto soggiorno mensile']);
      else if (s.due_settimane && nights >= s.due_settimane.notti_min) candidates.push([s.due_settimane.pct, 'Sconto soggiorno di due settimane']);
      else if (s.settimanale && nights >= s.settimanale.notti_min) candidates.push([s.settimanale.pct, 'Sconto soggiorno settimanale']);
    }
    if (s.last_minute && !(s.last_minute_non_in_eventi && hasEvent)) {
      const lead = Math.round((ci - today) / DAY);
      const ladder = [...s.last_minute].sort((a, b) => a.entro_giorni - b.entro_giorni);
      const hit = ladder.find(l => lead <= l.entro_giorni);
      if (hit) candidates.push([hit.pct, 'Sconto last minute']);
    }
    const gap = orphanGap(ci);
    if (gap && cfg.notti_orfane && nights === gap && !hasEvent) {
      candidates.push([gap === 1 ? cfg.notti_orfane.sconto_1_notte : cfg.notti_orfane.sconto_2_notti, 'Sconto date tra due soggiorni']);
    }
    // Gli sconti non si cumulano: vale il più alto.
    let discountPct = 0, discountLabel = '';
    candidates.forEach(c => { if (c[0] > discountPct) { discountPct = c[0]; discountLabel = c[1]; } });
    const discount = Math.round(subtotal * discountPct);
    const direct = Math.round((subtotal - discount) * (s.prenotazione_diretta || 0));
    const cleaning = cfg.pulizie || 0;
    const total = subtotal - discount - direct + cleaning;
    const taxNights = Math.min(nights, cfg.tassa_soggiorno_notti_max || nights);
    const tax = (cfg.tassa_soggiorno_persona_notte || 0) * guests * taxNights;
    return { nights, rows, subtotal, discountPct, discountLabel, discount, direct, cleaning, total, tax, avg: Math.round((subtotal - discount - direct) / nights) };
  }

  /* ---------- Calendario ---------- */
  function renderCalendar() {
    const y = view.getUTCFullYear(), m = view.getUTCMonth();
    monthLabel.textContent = `${MONTHS[m]} ${y}`;
    grid.innerHTML = '';
    const first = utc(y, m, 1);
    const offset = (first.getUTCDay() + 6) % 7; // lunedì = 0
    const days = utc(y, m + 1, 0).getUTCDate();
    for (let i = 0; i < offset; i++) grid.appendChild(Object.assign(document.createElement('span'), { className: 'cal__pad' }));
    for (let d = 1; d <= days; d++) {
      const date = utc(y, m, d);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal__day';
      btn.dataset.date = iso(date);
      const past = date < today, blocked = isBlocked(date);
      const n = nightlyPrice(date);
      btn.innerHTML = `<b>${d}</b><i>${past || blocked ? '' : fmtEur(n.price)}</i>`;
      if (past) btn.classList.add('is-past');
      if (blocked) btn.classList.add('is-blocked');
      if (n.events.length) { btn.classList.add('is-event'); btn.title = n.events.map(e => e.nome).join(', '); }
      if (checkIn && iso(date) === iso(checkIn)) btn.classList.add('is-start');
      if (checkOut && iso(date) === iso(checkOut)) btn.classList.add('is-end');
      if (checkIn && checkOut && date > checkIn && date < checkOut) btn.classList.add('is-range');
      btn.disabled = past || blocked;
      btn.setAttribute('aria-label', `${date.getUTCDate()} ${MONTHS[m]} ${y}${past ? ', passato' : blocked ? ', non disponibile' : ', ' + fmtEur(n.price) + ' a notte'}`);
      grid.appendChild(btn);
    }
    $('#calPrev').disabled = view <= utc(today.getUTCFullYear(), today.getUTCMonth(), 1);
    if (window.gsap && !document.documentElement.classList.contains('no-motion')) {
      gsap.from(grid.children, { opacity: 0, y: 6, duration: .35, stagger: .006, ease: 'power2.out', clearProps: 'all' });
    }
  }

  function onDayClick(e) {
    const btn = e.target.closest('.cal__day');
    if (!btn || btn.disabled) return;
    const date = parse(btn.dataset.date);
    if (!checkIn || (checkIn && checkOut)) { checkIn = date; checkOut = null; }
    else if (date <= checkIn) { checkIn = date; }
    else {
      // Nessuna notte bloccata nel mezzo.
      for (let d = new Date(checkIn); d < date; d = new Date(d.getTime() + DAY)) {
        if (isBlocked(d)) { checkIn = date; checkOut = null; renderCalendar(); renderQuote(); return; }
      }
      checkOut = date;
    }
    renderCalendar();
    renderQuote();
  }

  /* ---------- Riquadro preventivo ---------- */
  function renderQuote() {
    const guests = +guestsSel.value || 2;
    if (!checkIn) {
      quoteBox.innerHTML = `<p class="quote__hint">Seleziona la notte di arrivo e il giorno di partenza sul calendario.</p>`;
      return;
    }
    if (!checkOut) {
      quoteBox.innerHTML = `<p class="quote__hint">Arrivo <b>${fmtDate(checkIn)}</b>. Ora scegli il giorno di partenza.</p>`;
      return;
    }
    const q = quote(checkIn, checkOut, guests);
    if (!q || q.error) {
      quoteBox.innerHTML = `<p class="quote__hint quote__hint--warn">${q ? q.error : 'Date non valide.'}</p>`;
      return;
    }
    const lines = [
      [`${q.nights} ${q.nights === 1 ? 'notte' : 'notti'} · media ${fmtEur(q.avg)}/notte`, fmtEur(q.subtotal)],
      q.discount ? [`${q.discountLabel} (−${Math.round(q.discountPct * 100)}%)`, '−' + fmtEur(q.discount)] : null,
      q.direct ? [`Prenotazione diretta (−${Math.round(cfg.sconti.prenotazione_diretta * 100)}%)`, '−' + fmtEur(q.direct)] : null,
      [`Pulizie finali`, fmtEur(q.cleaning)]
    ].filter(Boolean);
    const subject = encodeURIComponent(`Richiesta Marradi 5: ${iso(checkIn)} → ${iso(checkOut)}, ${guests} ospiti`);
    const body = encodeURIComponent(`Buongiorno,\nvorrei prenotare Marradi 5 dal ${fmtDate(checkIn)} al ${fmtDate(checkOut)} (${q.nights} notti) per ${guests} ospiti.\nPreventivo indicativo dal sito: ${fmtEur(q.total)}.\nGrazie`);
    const wa = encodeURIComponent(`Buongiorno, vorrei prenotare Marradi 5 dal ${fmtDate(checkIn)} al ${fmtDate(checkOut)} (${q.nights} notti, ${guests} ospiti). Preventivo dal sito: ${fmtEur(q.total)}.`);
    quoteBox.innerHTML = `
      <div class="quote__dates"><span>${fmtDate(checkIn)}</span><i>→</i><span>${fmtDate(checkOut)}</span></div>
      <ul class="quote__lines">${lines.map(l => `<li><span>${l[0]}</span><b>${l[1]}</b></li>`).join('')}</ul>
      <div class="quote__total"><span>Totale</span><b data-total>${fmtEur(q.total)}</b></div>
      <p class="quote__note">Tassa di soggiorno del Comune di Milano esclusa: circa ${fmtEur(q.tax)} (${fmtEur2(cfg.tassa_soggiorno_persona_notte)} a persona a notte, esenti i minori di 18 anni, da pagare in loco).</p>
      <div class="quote__actions">
        <a class="btn" href="mailto:melissofabio@gmail.com?subject=${subject}&body=${body}">Richiedi queste date</a>
        <a class="btn btn--ghost" href="https://wa.me/39XXXXXXXXXX?text=${wa}">WhatsApp</a>
      </div>
      <button type="button" class="quote__reset" id="quoteReset">Azzera selezione</button>`;
    $('#quoteReset').addEventListener('click', () => { checkIn = checkOut = null; renderCalendar(); renderQuote(); });
    if (window.gsap && !document.documentElement.classList.contains('no-motion')) {
      gsap.from(quoteBox.children, { opacity: 0, y: 10, duration: .5, stagger: .06, ease: 'power3.out', clearProps: 'all' });
    }
  }

  /* ---------- Tabella "tariffe migliori" ---------- */
  function renderBestRates() {
    // Per i prossimi 12 mesi: prezzo minimo e tipico (mediana) per mese, con i periodi evento.
    const rows = [];
    for (let i = 0; i < 12; i++) {
      const m = utc(today.getUTCFullYear(), today.getUTCMonth() + i, 1);
      const days = utc(m.getUTCFullYear(), m.getUTCMonth() + 1, 0).getUTCDate();
      const prices = [];
      let evNames = new Set();
      for (let d = 1; d <= days; d++) {
        const date = utc(m.getUTCFullYear(), m.getUTCMonth(), d);
        if (date < today) continue;
        const n = nightlyPrice(date);
        prices.push(n.price);
        n.events.forEach(e => evNames.add(e.nome));
      }
      if (!prices.length) continue;
      prices.sort((a, b) => a - b);
      rows.push({
        label: `${MONTHS[m.getUTCMonth()]} ${m.getUTCFullYear()}`,
        min: prices[0], med: prices[Math.floor(prices.length / 2)],
        events: [...evNames]
      });
    }
    bestTable.innerHTML = rows.map(r => `
      <li data-reveal-row>
        <span class="best__month">${r.label}</span>
        <span class="best__from">da <b>${fmtEur(r.min)}</b></span>
        <span class="best__typ">tipico <b>${fmtEur(r.med)}</b></span>
        <span class="best__ev">${r.events.length ? r.events.join(' · ') : '—'}</span>
      </li>`).join('');
    if (window.ScrollTrigger && !document.documentElement.classList.contains('no-motion')) {
      gsap.from(bestTable.children, { opacity: 0, x: -16, duration: .7, stagger: .05, ease: 'power3.out',
        scrollTrigger: { trigger: bestTable, start: 'top 85%', once: true } });
    }
    if (legendEvents) {
      const upcoming = eventi.filter(e => e._a >= today).sort((a, b) => a._da - b._da).slice(0, 8);
      legendEvents.innerHTML = upcoming.map(e => `<li><span>${e.nome}</span><b>${fmtDate(e._da)} – ${fmtDate(e._a)}</b></li>`).join('') || '<li><span>Nessun evento caricato</span></li>';
    }
  }

  /* ---------- Avvio ---------- */
  function init() {
    $('#calPrev').addEventListener('click', () => { view = utc(view.getUTCFullYear(), view.getUTCMonth() - 1, 1); renderCalendar(); });
    $('#calNext').addEventListener('click', () => { view = utc(view.getUTCFullYear(), view.getUTCMonth() + 1, 1); renderCalendar(); });
    grid.addEventListener('click', onDayClick);
    guestsSel.addEventListener('change', renderQuote);
    const upd = $('#ratesUpdated'); if (upd && cfg.aggiornato) upd.textContent = new Date(cfg.aggiornato).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    const min = $('#ratesMinStay'); if (min) min.textContent = cfg.soggiorno_minimo;
    renderCalendar();
    renderQuote();
    renderBestRates();
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }
})();
