// The "?" mark: a black circle with a white question mark placed on top of a question image.
// Stored on the question as mark = { x, y, s }: centre x / y as fractions of the image's width / height,
// s = diameter as a fraction of the image's width.

export const QMARK_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="#000" stroke="#fff" stroke-width="3"/><text x="50" y="53" text-anchor="middle" dominant-baseline="central" font-family="'Lilita One', 'Arial Black', sans-serif" font-size="68" fill="#fff">?</text></svg>`;

export function markStyle(m) {
  return `left:${(m.x * 100).toFixed(3)}%;top:${(m.y * 100).toFixed(3)}%;width:${(m.s * 100).toFixed(3)}%`;
}

/** The image wrapped with its mark (if any). The wrapper hugs the image, so % positions match the image. */
export function markedImage(src, mark, cls = '') {
  return `<span class="qi-wrap ${cls}"><img src="${src}" alt="">${mark ? `<span class="qmark" style="${markStyle(mark)}">${QMARK_SVG}</span>` : ''}</span>`;
}

/**
 * Editor: drag the mark to place it, drag the corner handle / slider / mouse wheel to resize.
 * Resolves with the new mark, null (removed) or undefined (cancelled).
 */
export function editMark(src, mark) {
  return new Promise((resolve) => {
    const m = { ...(mark || { x: 0.5, y: 0.5, s: 0.22 }) };
    const ov = document.createElement('div');
    ov.className = 'qmark-editor';
    ov.innerHTML = `<div class="qme-panel">
      <div class="qme-head"><b>❓ Place the question mark</b><span>Drag it to move · drag the corner (or the slider / mouse wheel) to resize</span></div>
      <div class="qme-stage"><span class="qi-wrap qme-wrap"><img src="${src}" alt="" draggable="false"><span class="qmark qme-mark">${QMARK_SVG}<span class="qme-handle" title="Drag to resize"></span></span></span></div>
      <div class="qme-row"><label>Size <input type="range" min="0.04" max="0.9" step="0.005" class="qme-size"></label>
        <span class="qme-btns">${mark ? '<button class="btn-mini" data-q="remove">🗑 Remove mark</button>' : ''}<button class="btn-mini" data-q="cancel">Cancel</button><button class="btn" data-q="save">✔ Save</button></span></div>
    </div>`;
    document.body.appendChild(ov);
    const wrap = ov.querySelector('.qme-wrap');
    const el = ov.querySelector('.qme-mark');
    const size = ov.querySelector('.qme-size');
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const draw = () => { el.setAttribute('style', markStyle(m)); size.value = m.s; };
    draw();
    let drag = null;
    const rect = () => wrap.getBoundingClientRect();
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const r = rect();
      drag = e.target.classList.contains('qme-handle')
        ? { mode: 'size', cx: r.left + m.x * r.width, cy: r.top + m.y * r.height }
        : { mode: 'move', dx: e.clientX - (r.left + m.x * r.width), dy: e.clientY - (r.top + m.y * r.height) };
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = rect();
      if (drag.mode === 'move') {
        m.x = clamp((e.clientX - drag.dx - r.left) / r.width, 0, 1);
        m.y = clamp((e.clientY - drag.dy - r.top) / r.height, 0, 1);
      } else {
        const d = Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) * 2 / Math.SQRT2;
        m.s = clamp(d / r.width, 0.04, 0.9);
      }
      draw();
    });
    el.addEventListener('pointerup', () => { drag = null; });
    size.addEventListener('input', () => { m.s = +size.value; draw(); });
    wrap.addEventListener('wheel', (e) => { e.preventDefault(); m.s = clamp(m.s * (e.deltaY < 0 ? 1.06 : 0.94), 0.04, 0.9); draw(); }, { passive: false });
    const done = (v) => { ov.remove(); window.removeEventListener('keydown', onKey, true); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(undefined); } };
    window.addEventListener('keydown', onKey, true);
    ov.addEventListener('click', (e) => {
      const a = e.target.closest('[data-q]')?.dataset.q;
      if (a === 'save') done({ x: +m.x.toFixed(4), y: +m.y.toFixed(4), s: +m.s.toFixed(4) });
      if (a === 'remove') done(null);
      if (a === 'cancel' || e.target === ov) done(undefined);
    });
  });
}
