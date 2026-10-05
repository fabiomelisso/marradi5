/* Marradi 5 — motion
   Stack: GSAP 3.15 + ScrollTrigger + SplitText, Lenis, Swiper, Leaflet.
   Tutto il motion è disattivato con prefers-reduced-motion. */
(function () {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGsap = typeof gsap !== 'undefined';

  if (reduce || !hasGsap) document.documentElement.classList.add('no-motion');

  /* ---------- Preloader ---------- */
  const preloader = document.getElementById('preloader');
  const counter = document.getElementById('preloaderCount');
  const heroImg = document.querySelector('.hero__img');

  function finishPreloader() {
    if (!preloader) return;
    preloader.classList.add('is-done');
    if (reduce || !hasGsap) { preloader.remove(); startHero(); return; }
    gsap.timeline({ onComplete: () => preloader.remove() })
      .to(counter, { textContent: 100, duration: .9, snap: { textContent: 1 }, ease: 'power2.inOut' })
      .to('.preloader__inner', { yPercent: -30, opacity: 0, duration: .5, ease: 'power3.in' }, '+=.1')
      .to(preloader, { yPercent: -100, duration: .9, ease: 'power4.inOut', onStart: startHero }, '-=.2');
  }

  // Attende l'immagine hero (max 2,5 s) così il sipario si apre su una foto già pronta.
  const heroReady = new Promise(resolve => {
    if (!heroImg || heroImg.complete) return resolve();
    heroImg.addEventListener('load', resolve, { once: true });
    heroImg.addEventListener('error', resolve, { once: true });
    setTimeout(resolve, 2500);
  });
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  Promise.all([heroReady, fontsReady]).then(finishPreloader);

  /* ---------- Smooth scroll (Lenis) ---------- */
  let lenis = null;
  if (!reduce && hasGsap && typeof Lenis !== 'undefined') {
    lenis = new Lenis({ lerp: .09, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // Link interni: scroll morbido con Lenis, nativo altrimenti.
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.4 });
      else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  if (!hasGsap) { initSwiper(); initMap(); return; }
  gsap.registerPlugin(ScrollTrigger, SplitText);

  /* ---------- Split text (titoli) ---------- */
  const splits = new Map();
  function splitTitles() {
    document.querySelectorAll('[data-split]').forEach(el => {
      if (splits.has(el)) return;
      const s = new SplitText(el, { type: 'lines', linesClass: 'split-line' });
      // Seconda divisione: ogni riga in un wrapper mascherato con il testo da animare.
      s.lines.forEach(line => {
        const inner = document.createElement('span');
        inner.className = 'split-inner';
        inner.style.display = 'block';
        while (line.firstChild) inner.appendChild(line.firstChild);
        line.appendChild(inner);
      });
      splits.set(el, s);
    });
  }
  fontsReady.then(() => { splitTitles(); initScrollMotion(); ScrollTrigger.refresh(); });

  /* ---------- Hero ---------- */
  function startHero() {
    if (reduce) return;
    const hero = document.querySelector('.hero');
    if (!hero) return;
    const lines = hero.querySelectorAll('.hero__title .split-inner');
    gsap.timeline({ defaults: { ease: 'power4.out' } })
      .from('.hero__overline', { y: 20, opacity: 0, duration: .9 })
      .from(lines, { yPercent: 110, duration: 1.3, stagger: .09 }, '-=.6')
      .to(hero.querySelectorAll('[data-reveal]'), { y: 0, opacity: 1, duration: 1, stagger: .12 }, '-=.8')
      .from('.factbar li', { y: 24, opacity: 0, duration: .9, stagger: .08, onStart: countUp }, '-=.6');
  }

  function countUp() {
    document.querySelectorAll('[data-count]').forEach(el => {
      const target = +el.dataset.count;
      gsap.fromTo(el, { textContent: 0 }, { textContent: target, duration: 1.6, ease: 'power2.out', snap: { textContent: 1 } });
    });
  }
  if (reduce) document.querySelectorAll('[data-count]').forEach(el => { el.textContent = el.dataset.count; });

  /* ---------- Motion allo scroll ---------- */
  function initScrollMotion() {
    if (reduce) return;

    // Titoli: riga per riga quando entrano nel viewport (escluso hero).
    document.querySelectorAll('[data-split]:not(.hero__title)').forEach(el => {
      gsap.from(el.querySelectorAll('.split-inner'), {
        yPercent: 110, duration: 1.2, stagger: .08, ease: 'power4.out',
        scrollTrigger: { trigger: el, start: 'top 85%', once: true }
      });
    });

    // Reveal generici (escluso hero, gestito a parte).
    gsap.utils.toArray('[data-reveal]').forEach(el => {
      if (el.closest('.hero')) return;
      gsap.to(el, {
        y: 0, opacity: 1, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });

    // Parallax leggero sulle immagini dell'intro.
    gsap.utils.toArray('[data-parallax]').forEach(el => {
      const amount = +el.dataset.parallax || 10;
      gsap.fromTo(el, { yPercent: -amount }, {
        yPercent: amount, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    });

    // Griglia servizi: stagger a cascata.
    ScrollTrigger.batch('.amenities__grid li', {
      start: 'top 90%', once: true,
      onEnter: batch => gsap.to(batch, { y: 0, opacity: 1, duration: .9, stagger: .07, ease: 'power3.out', overwrite: true })
    });

    // Hero: la foto scorre più lentamente del contenuto.
    gsap.to('.hero__media', {
      yPercent: 18, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });

    // Nav: si nasconde scendendo, riappare risalendo.
    const nav = document.getElementById('nav');
    ScrollTrigger.create({
      start: 'top -120',
      onUpdate: self => nav.classList.toggle('is-hidden', self.direction === 1),
      onLeaveBack: () => nav.classList.remove('is-hidden')
    });
  }

  /* ---------- Spazi: capitoli sticky ---------- */
  const spaceImgs = document.querySelectorAll('[data-space-img]');
  const spaceIndex = document.getElementById('spaceIndex');
  function activateSpace(i) {
    spaceImgs.forEach(img => img.classList.toggle('is-active', +img.dataset.spaceImg === i));
    document.querySelectorAll('.space').forEach(li => li.classList.toggle('is-active', +li.dataset.space === i));
    if (spaceIndex) spaceIndex.textContent = String(i + 1).padStart(2, '0');
  }
  document.querySelectorAll('.space').forEach(li => {
    ScrollTrigger.create({
      trigger: li, start: 'top 55%', end: 'bottom 55%',
      onEnter: () => activateSpace(+li.dataset.space),
      onEnterBack: () => activateSpace(+li.dataset.space)
    });
  });
  activateSpace(0);

  /* ---------- Cursore e bottoni magnetici ---------- */
  if (finePointer && !reduce) {
    const cursor = document.getElementById('cursor');
    const xTo = gsap.quickTo(cursor, 'x', { duration: .25, ease: 'power3' });
    const yTo = gsap.quickTo(cursor, 'y', { duration: .25, ease: 'power3' });
    window.addEventListener('pointermove', e => { xTo(e.clientX); yTo(e.clientY); });
    document.querySelectorAll('a, button, .gallery__item').forEach(el => {
      el.addEventListener('pointerenter', () => cursor.classList.add('is-hover'));
      el.addEventListener('pointerleave', () => cursor.classList.remove('is-hover'));
    });
    document.querySelectorAll('[data-magnetic]').forEach(btn => {
      const bx = gsap.quickTo(btn, 'x', { duration: .4, ease: 'power3' });
      const by = gsap.quickTo(btn, 'y', { duration: .4, ease: 'power3' });
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        bx((e.clientX - (r.left + r.width / 2)) * .3);
        by((e.clientY - (r.top + r.height / 2)) * .3);
      });
      btn.addEventListener('pointerleave', () => { bx(0); by(0); });
    });
  }

  initSwiper();
  initMap();

  /* ---------- Galleria (Swiper) ---------- */
  function initSwiper() {
    if (typeof Swiper === 'undefined') return;
    const progress = document.getElementById('galleryProgress');
    const swiper = new Swiper('#gallerySwiper', {
      slidesPerView: 'auto',
      spaceBetween: 16,
      grabCursor: true,
      speed: reduce ? 0 : 700,
      freeMode: { enabled: true, momentumRatio: .6 },
      navigation: { nextEl: '#galleryNext', prevEl: '#galleryPrev' },
      on: { progress: (s, p) => { if (progress) progress.style.width = Math.max(4, p * 100) + '%'; } }
    });
    return swiper;
  }

  /* ---------- Mappa (Leaflet + OpenStreetMap) ---------- */
  function initMap() {
    const el = document.getElementById('map');
    if (!el || typeof L === 'undefined') return;
    const pos = [45.4646743, 9.1739320];
    const map = L.map(el, { scrollWheelZoom: false, zoomControl: true }).setView(pos, 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    const pin = L.divIcon({ className: '', html: '<div class="map-pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
    L.marker(pos, { icon: pin }).addTo(map).bindPopup('<b>Marradi 5</b><br>Via Giovanni Marradi 5, Milano');
    if (lenis) {
      // Dentro la mappa lo scroll serve allo zoom: Lenis ignora quell'area.
      el.setAttribute('data-lenis-prevent', '');
    }
  }
})();
