# Marradi 5 — sito vetrina

Sito statico single-page per l'appartamento d'epoca in via Marradi 5, Milano (locazione breve).

- Nessun build step: `index.html`, `css/style.css`, `js/main.js`, foto in `foto/web/`.
- Motion: GSAP 3.15 + ScrollTrigger + SplitText, Lenis (smooth scroll), Swiper (galleria), PhotoSwipe (lightbox), Leaflet (mappa). Tutto via CDN con versione fissata.
- Rispetta `prefers-reduced-motion`.
- Hosting: GitHub Pages dal branch `main`.

## Sviluppo locale

```bash
python3 -m http.server 8080
```

poi apri http://localhost:8080.

## Da completare

- Numero WhatsApp nel bottone "WhatsApp" (`index.html`, cerca `39XXXXXXXXXX`).
- CIN (Codice Identificativo Nazionale) nel footer: obbligatorio per gli annunci di locazione breve.
- Link Airbnb / Booking.com quando disponibili.
- Foto in alta risoluzione per corridoio e seconda camera (ora 640×360).

Le foto originali restano fuori dal repository (`foto/originali/` è in `.gitignore`).
