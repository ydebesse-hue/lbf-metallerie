/**
 * profils-utils.js — Fonctions partagées rendu section (SVG coté + tableau dimensions)
 * Chargé sur bibliotheque.html ET stock.html
 */

/* ══════════════════════════════════════════════
   SVG ANNOTÉ (SCHÉMA COTÉ)
══════════════════════════════════════════════ */

/**
 * Génère un SVG coté pour la fiche détail d'une section
 * @param {Object} section  - objet section avec famille, serie, et dimensions
 * @param {number} w        - largeur du SVG
 * @param {number} h        - hauteur du SVG
 * @returns {string}        - balise <svg>...</svg>
 */
function profilSvgCote(section, w, h) {
  const S = '#333', F = '#c8d4de', R = '#d22323';
  const ns = 'http://www.w3.org/2000/svg';
  let inner = '';

  const e = (tag, attrs, txt = '') => {
    const a = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<${tag} ${a}>${txt}</${tag}>`;
  };

  const ligne = (x1, y1, x2, y2, c = R, dw = 1) =>
    e('line', { x1, y1, x2, y2, stroke: c, 'stroke-width': dw });

  const texte = (x, y, txt, anc = 'middle', rot = '') =>
    e('text', {
      x, y,
      'font-size': 9,
      fill: R,
      'font-family': 'Tahoma',
      'text-anchor': anc,
      transform: rot ? `rotate(${rot},${x},${y})` : ''
    }, txt);

  const fleche = (x1, y1, x2, y2, lbl, lx, ly, rot = '') => `
    ${ligne(x1, y1, x2, y2)}
    ${ligne(x1 - 4, y1, x1 + 4, y1)}
    ${ligne(x2 - 4, y2, x2 + 4, y2)}
    ${texte(lx, ly, lbl, 'middle', rot)}`;

  switch (section.famille) {

    case 'Profilés I': case 'Profilés H': {
      const bw = section.serie?.startsWith('IPE') ? 90 : 110;
      const ox = (w - bw) / 2;
      const th = (section.serie === 'HEB' || section.serie === 'HEM') ? 18 : 13;
      const tw = section.tw || 6;
      inner += e('rect', { x: ox, y: 18, width: bw, height: th, fill: F, stroke: S, 'stroke-width': 1.5 });
      inner += e('rect', { x: ox, y: h - 18 - th, width: bw, height: th, fill: F, stroke: S, 'stroke-width': 1.5 });
      inner += e('rect', {
        x: ox + bw / 2 - tw / 2, y: 18 + th,
        width: tw, height: h - 36 - 2 * th,
        fill: F, stroke: S, 'stroke-width': 1.5
      });
      inner += fleche(12, 18, 12, h - 18, 'h', 5, h / 2, '-90');
      inner += fleche(ox, h - 5, ox + bw, h - 5, 'b', ox + bw / 2, h - 1);
      break;
    }

    case 'Profilés U': {
      const bw = 80, ox = (w - bw) / 2;
      inner += e('rect', { x: ox, y: 18, width: bw, height: 12, fill: F, stroke: S, 'stroke-width': 1.5 });
      inner += e('rect', { x: ox, y: h - 30, width: bw, height: 12, fill: F, stroke: S, 'stroke-width': 1.5 });
      inner += e('rect', { x: ox, y: 30, width: 10, height: h - 60, fill: F, stroke: S, 'stroke-width': 1.5 });
      inner += fleche(12, 18, 12, h - 18, 'h', 5, h / 2, '-90');
      inner += fleche(ox, h - 4, ox + bw, h - 4, 'b', ox + bw / 2, h - 1);
      break;
    }

    case 'Cornière': {
      inner += e('rect', { x: 30, y: h - 30, width: w - 40, height: 12, fill: F, stroke: S, 'stroke-width': 1.5 });
      inner += e('rect', { x: 30, y: 18, width: 12, height: h - 36, fill: F, stroke: S, 'stroke-width': 1.5 });
      inner += fleche(12, 18, 12, h - 18, 'h', 5, h / 2, '-90');
      if (section.serie === 'L inégale') {
        inner += fleche(30, h - 4, w - 10, h - 4, 'b', (30 + w - 10) / 2, h - 1);
      }
      break;
    }

    case 'Plat': {
      inner += e('rect', { x: 20, y: h / 2 - 20, width: w - 40, height: 40, fill: F, stroke: S, 'stroke-width': 1.5 });
      inner += fleche(20, h - 5, w - 20, h - 5, 'b', w / 2, h - 1);
      inner += fleche(w - 8, h / 2 - 20, w - 8, h / 2 + 20, 'e', w - 2, h / 2);
      break;
    }

    case 'Barres rondes': {
      const cx = w / 2, cy = h / 2, ro = Math.min(w, h) / 2 - 18;
      inner += e('circle', { cx, cy, r: ro, fill: F, stroke: S, 'stroke-width': 1.5 });
      inner += fleche(cx - ro, cy, cx + ro, cy, 'd', cx, cy - 6);
      break;
    }

    case 'Barres carrées': {
      const sw = 90, ox = (w - sw) / 2, oy = (h - sw) / 2;
      inner += e('rect', { x: ox, y: oy, width: sw, height: sw, fill: F, stroke: S, 'stroke-width': 1.5 });
      inner += fleche(12, oy, 12, oy + sw, 'a', 5, h / 2, '-90');
      inner += fleche(ox, h - 5, ox + sw, h - 5, 'a', ox + sw / 2, h - 1);
      break;
    }

    case 'Profilés creux': {
      if (section.serie === 'CHS') {
        const cx = w / 2, cy = h / 2, ro = Math.min(w, h) / 2 - 18, ep = (section.e ?? section.t) || 4;
        const ri = Math.max(ro - ep * 4, ro * 0.6);
        inner += e('circle', { cx, cy, r: ro, fill: F, stroke: S, 'stroke-width': 1.5 });
        inner += e('circle', { cx, cy, r: ri, fill: 'white', stroke: S, 'stroke-width': 1.5 });
        inner += fleche(cx, cy - ro, cx, cy + ro, 'de', cx + 6, cy, '');
        inner += fleche(cx, cy - ri, cx, cy + ri, 'di', cx - 6, cy, '');
      } else if (section.serie === 'RHS') {
        const bw = 110, bh = 80, ox = (w - bw) / 2, oy = (h - bh) / 2, ep = 9;
        inner += e('rect', { x: ox, y: oy, width: bw, height: bh, fill: F, stroke: S, 'stroke-width': 1.5 });
        inner += e('rect', { x: ox + ep, y: oy + ep, width: bw - 2 * ep, height: bh - 2 * ep, fill: 'white', stroke: S, 'stroke-width': 1.5 });
        inner += fleche(12, oy, 12, oy + bh, 'h', 5, h / 2, '-90');
        inner += fleche(ox, h - 5, ox + bw, h - 5, 'b', ox + bw / 2, h - 1);
      } else { // SHS
        const sw = 90, ox = (w - sw) / 2, oy = (h - sw) / 2, ep = 9;
        inner += e('rect', { x: ox, y: oy, width: sw, height: sw, fill: F, stroke: S, 'stroke-width': 1.5 });
        inner += e('rect', { x: ox + ep, y: oy + ep, width: sw - 2 * ep, height: sw - 2 * ep, fill: 'white', stroke: S, 'stroke-width': 1.5 });
        inner += fleche(12, oy, 12, oy + sw, 'h', 5, h / 2, '-90');
        inner += fleche(ox, h - 5, ox + sw, h - 5, 'h', ox + sw / 2, h - 1);
      }
      break;
    }

    default:
      inner += e('rect', { x: 20, y: 20, width: w - 40, height: h - 40, fill: F, stroke: S, 'stroke-width': 1.5, rx: 3 });
  }

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="${ns}">${inner}</svg>`;
}

/* ══════════════════════════════════════════════
   TABLEAU DIMENSIONS
══════════════════════════════════════════════ */

/**
 * Génère le HTML des dimensions normalisées d'une section
 * @param {Object} s  - objet section
 * @returns {string}  - HTML avec divs .dim-row
 */
function profilDimsTableau(s) {
  const lignes = [];
  const fam = s.famille || '';
  const ser = s.serie   || '';

  if (fam === 'Profilés creux' || ['SHS','RHS','CHS'].includes(ser)) {
    if (s.fabrication) lignes.push(['Façonnage', s.fabrication === 'chaud' ? 'À chaud (EN 10210)' : 'À froid (EN 10219)']);
    if (ser === 'CHS') {
      const ep = s.e ?? s.t;
      const di = s.di ?? (s.d !== undefined && ep !== undefined
        ? Math.round((s.d - 2 * ep) * 10) / 10 : undefined);
      if (s.d  !== undefined) lignes.push(['de — Diamètre ext.', `${s.d} mm`]);
      if (di   !== undefined) lignes.push(['di — Diamètre int.', `${di} mm`]);
      if (ep   !== undefined) lignes.push(['t — Épaisseur',      `${ep} mm`]);
    } else if (ser === 'RHS') {
      if (s.a   !== undefined) lignes.push(['h — Hauteur',     `${s.a} mm`]);
      if (s.b   !== undefined) lignes.push(['b — Largeur',     `${s.b} mm`]);
      const ep = s.e ?? s.t;
      if (ep    !== undefined) lignes.push(['t — Épaisseur',   `${ep} mm`]);
      if (s.ri  !== undefined) lignes.push(['ri — Rayon int.', `${s.ri} mm`]);
      if (s.re  !== undefined) lignes.push(['re — Rayon ext.', `${s.re} mm`]);
    } else { // SHS
      if (s.a   !== undefined) lignes.push(['h — Hauteur',     `${s.a} mm`]);
      const ep = s.e ?? s.t;
      if (ep    !== undefined) lignes.push(['t — Épaisseur',   `${ep} mm`]);
      if (s.ri  !== undefined) lignes.push(['ri — Rayon int.', `${s.ri} mm`]);
      if (s.re  !== undefined) lignes.push(['re — Rayon ext.', `${s.re} mm`]);
    }
    if (s.pml !== undefined) lignes.push(['Poids/ml', `${s.pml} kg/m`]);

  } else if (fam === 'Barres rondes' || ser === 'Rond') {
    if (s.d   !== undefined) lignes.push(['d — Diamètre', `${s.d} mm`]);
    if (s.pml !== undefined) lignes.push(['Poids/ml',     `${s.pml} kg/m`]);
    if (s.A   !== undefined) lignes.push(['Section',      `${s.A} cm²`]);

  } else if (fam === 'Barres carrées' || ser === 'Carré') {
    if (s.a   !== undefined) lignes.push(['a — Côté',  `${s.a} mm`]);
    if (s.pml !== undefined) lignes.push(['Poids/ml',  `${s.pml} kg/m`]);
    if (s.A   !== undefined) lignes.push(['Section',   `${s.A} cm²`]);

  } else if (fam === 'Cornière' || ['L égale','L inégale'].includes(ser)) {
    if (ser === 'L inégale') {
      if (s.a   !== undefined) lignes.push(['h — Hauteur',         `${s.a} mm`]);
      if (s.b   !== undefined) lignes.push(['b — Largeur',         `${s.b} mm`]);
    } else {
      if (s.a   !== undefined) lignes.push(['h — Largeur d\'aile', `${s.a} mm`]);
    }
    if (s.t  !== undefined) lignes.push(['t — Épaisseur',   `${s.t} mm`]);
    if (s.r1 !== undefined) lignes.push(['r1 — Rayon int.', `${s.r1} mm`]);
    if (s.pml!== undefined) lignes.push(['Poids/ml',        `${s.pml} kg/m`]);
    if (s.A  !== undefined) lignes.push(['Section',         `${s.A} cm²`]);

  } else {
    if (s.h  !== undefined) lignes.push(['h — Hauteur',        `${s.h} mm`]);
    if (s.b  !== undefined) lignes.push(['b — Largeur aile',   `${s.b} mm`]);
    if (s.tw !== undefined) lignes.push(['tw — Épaisseur âme',  `${s.tw} mm`]);
    if (s.tf !== undefined) lignes.push(['tf — Épaisseur aile', `${s.tf} mm`]);
    if (s.r  !== undefined) lignes.push(['r — Congé',           `${s.r} mm`]);
    if (s.pml!== undefined) lignes.push(['Poids/ml',            `${s.pml} kg/m`]);
    if (s.A  !== undefined) lignes.push(['Section',             `${s.A} cm²`]);
    if (s.norme)       lignes.push(['Norme',    s.norme]);
    if (s.fabrication) lignes.push(['Façonnage', s.fabrication === 'chaud' ? 'À chaud (EN 10210)' : 'À froid (EN 10219)']);
  }

  return lignes.map(([label, val]) => `
    <div class="dim-row">
      <span class="dim-label">${label}</span>
      <span class="dim-val">${val}</span>
    </div>`).join('');
}

/* ══════════════════════════════════════════════
   ZOOM IMAGE (overlay plein écran)
══════════════════════════════════════════════ */

/**
 * Toggle zoom plein écran sur une image de profil
 * @param {HTMLImageElement} img
 */
function profilZoomImage(img) {
  const zoomed = img.dataset.zoom === '1';

  if (zoomed) {
    img.dataset.zoom = '0';
    img.style.cursor = 'zoom-in';
    const overlay = document.getElementById('profil-zoom-overlay');
    if (overlay) overlay.remove();
    return;
  }

  img.dataset.zoom = '1';
  img.style.cursor = 'zoom-out';

  const overlay = document.createElement('div');
  overlay.id = 'profil-zoom-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.75);' +
    'display:flex;align-items:center;justify-content:center;z-index:9999;cursor:zoom-out;';
  overlay.onclick = () => profilZoomImage(img);

  const grande = document.createElement('img');
  grande.src   = img.src;
  grande.alt   = img.alt;
  grande.style.cssText =
    'max-width:90vw;max-height:85vh;object-fit:contain;display:block;' +
    'border-radius:4px;box-shadow:0 8px 40px rgba(0,0,0,.6);';
  overlay.appendChild(grande);

  const btnFermer = document.createElement('button');
  btnFermer.textContent = '✕';
  btnFermer.style.cssText =
    'position:fixed;top:16px;right:16px;background:rgba(255,255,255,.15);' +
    'border:none;color:#fff;font-size:22px;cursor:pointer;border-radius:50%;' +
    'width:36px;height:36px;display:flex;align-items:center;justify-content:center;';
  btnFermer.onclick = (e) => { e.stopPropagation(); profilZoomImage(img); };
  overlay.appendChild(btnFermer);

  document.body.appendChild(overlay);
}
