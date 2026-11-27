// demo.js - Demo mode: what an element does, said beside it.
//
// On by default, and the reader turns it off in the header. With the pointer
// on an element that has a hint, the hint stands in the empty margin beside the
// page, joined to the element by a thin line ending in a dot, the way a comment
// sits beside a document. Where the margin is too narrow for a note, the note
// stands right beside the element instead, or above or below a wide one, still
// joined to it.
//
// A phone has no margin and no hover. There the first tap on such an element
// shows its hint over the page, once, and the next tap anywhere puts it away.
//
// The notes are fixed to the window and laid over the page, outside its flow,
// so no container changes size and no chart redraws because of them.

import i18n, { DEMO_TEXT } from '../i18n.js';
import { esc } from './utils.js';

const STORE = 'hvDemo';
const NOTE_WIDTH = 220;
const MIN_NOTE = 132;        // a note narrower than this is too narrow to read
const GAP = 12;

// Which elements have a hint, by the name the text is kept under in i18n.js.
// The first selector that matches, walking out from the pointer, wins, so an
// element inside another one with a hint says its own.
export const HINTS = [
  { id: 'typeButton', selector: ".hv-types .investor-preset-btn" },
  { id: 'panelNumber', selector: "#nc-panel .nc-num, #nc-panel .nc-edit" },
  { id: 'modalSlider', selector: "#modal-ltv-slider, #modal-mortgage-spread-slider, #modal-opcost-slider, #modal-period-slider, #modal-rent-spread-slider, #modal-longterm-inflation-slider" },
  { id: 'modalCapm', selector: "#modal-beta-slider, #modal-liq-premium-slider" },
  { id: 'modalValue', selector: "#modal-ltv-value, #modal-mortgage-spread-value, #modal-opcost-value, #modal-period-value, #modal-rent-spread-value, #modal-longterm-inflation-value" },
  { id: 'curveDrag', selector: "#vertical-sliders-container .curve-editor-chart" },
  { id: 'curveNumber', selector: "#vertical-sliders-container .curve-editor-num" },
  { id: 'resetAll', selector: "#reset-defaults" },
  { id: 'windowYear', selector: "#window-year-select" },
  { id: 'demoToggle', selector: "#demo-toggle" },
];

let on = true;
let active = null;           // { target, id }
let note = null;
let leader = null;
let showTimer = null;
let pendingHit = null;       // the element a note is about to be shown for
let passedOver = null;       // the element the pointer is on while a focus note holds
let passTimer = null;
// The plan's own walkthrough is the introduction while it runs.
const walking = () => Boolean(document.querySelector('.pw-card'));
let hideTimer = null;
let frame = null;
const seen = new Set();      // on a phone, each hint once per visit

const lang = () => (i18n.getCurrentLanguage() === 'en' ? 'en' : 'nl');
// The width the page is laid out in, without a scrollbar that takes room.
const viewWidth = () => document.documentElement.clientWidth || window.innerWidth;
const textOf = id => (DEMO_TEXT[lang()] || {})[id] || '';
const narrow = () => document.documentElement.clientWidth < 700 || window.matchMedia('(hover: none)').matches;

function hintAt(node) {
  for (let el = node; el && el !== document.body; el = el.parentElement) {
    if (!(el instanceof Element)) continue;
    for (const hint of HINTS) {
      if (el.matches(hint.selector) && textOf(hint.id)) return { target: el, id: hint.id };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Beside the page.

function ensureLayers() {
  if (!note) {
    note = document.createElement('div');
    note.className = 'demo-note';
    note.setAttribute('role', 'note');
    note.hidden = true;
    document.body.appendChild(note);
  }
  if (!leader) {
    leader = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    leader.setAttribute('class', 'demo-leader');
    leader.setAttribute('aria-hidden', 'true');
    leader.style.display = 'none';
    document.body.appendChild(leader);
  }
}

function place() {
  frame = null;
  if (!active || !note) return;
  if (!document.contains(active.target) || !active.target.getClientRects().length) { hide(true); return; }
  const box = active.target.getBoundingClientRect();
  const point = active.x !== undefined ? { x: active.x, y: active.y } : null;
  if (!inSight(active.target, box, point)) {
    // Out of sight for now; it comes back with the element, while the pointer
    // or the focus is still on it.
    conceal();
    return;
  }
  note.hidden = false;

  const page = document.body.getBoundingClientRect();
  // Level with the element, or with the pointer on a tall one.
  const anchorY = Math.min(box.bottom - 4, Math.max(box.top + 4,
    active.y !== undefined && box.height > 120 ? active.y : box.top + box.height / 2));
  const anchorX = active.x !== undefined && box.width > 240
    ? Math.min(box.right - 4, Math.max(box.left + 4, active.x)) : box.left + box.width / 2;

  // In the margin nearer the element if it has room, else in the other one.
  const margin = side => (side === 'left' ? page.left : viewWidth() - page.right) - 2 * GAP;
  const near = anchorX < viewWidth() / 2 ? 'left' : 'right';
  const far = near === 'left' ? 'right' : 'left';
  const side = margin(near) >= MIN_NOTE ? near : (margin(far) >= MIN_NOTE ? far : null);

  let left;
  let top;
  let from;
  let to;
  if (side) {
    const width = Math.min(NOTE_WIDTH, margin(side));
    note.style.width = `${width}px`;
    const height = note.offsetHeight;
    left = side === 'left' ? page.left - GAP - width : page.right + GAP;
    top = Math.min(window.innerHeight - height - 8, Math.max(8, anchorY - height / 2));
    from = { x: side === 'left' ? left + width : left, y: Math.min(top + height - 6, Math.max(top + 6, anchorY)) };
    to = { x: side === 'left' ? box.left : box.right, y: anchorY };
  } else {
    // No margin: right beside the element, or above or below a wide one.
    const width = NOTE_WIDTH;
    note.style.width = `${width}px`;
    const height = note.offsetHeight;
    const rightRoom = viewWidth() - box.right - GAP - 8;
    const leftRoom = box.left - GAP - 8;
    // A year's value in the curve editor has the other years' values on either
    // side of it: its note goes below the row, under the years too.
    const row = active.id === 'curveNumber';
    const rowBox = row && active.target.closest('.curve-editor-values');
    const under = rowBox ? rowBox.getBoundingClientRect().bottom : box.bottom;
    if (!row && (rightRoom >= width || leftRoom >= width)) {
      const onRight = rightRoom >= width && (rightRoom >= leftRoom || leftRoom < width);
      left = onRight ? box.right + GAP : box.left - GAP - width;
      top = Math.min(window.innerHeight - height - 8, Math.max(8, anchorY - height / 2));
      from = { x: onRight ? left : left + width, y: Math.min(top + height - 6, Math.max(top + 6, anchorY)) };
      to = { x: onRight ? box.right : box.left, y: anchorY };
    } else {
      const below = row || window.innerHeight - box.bottom >= height + GAP + 8 || box.top < height + GAP + 8;
      left = Math.min(viewWidth() - width - 8, Math.max(8, anchorX - width / 2));
      top = below ? Math.min(window.innerHeight - height - 8, under + GAP)
        : Math.max(8, box.top - GAP - height);
      from = { x: Math.min(left + width - 6, Math.max(left + 6, anchorX)), y: below ? top : top + height };
      to = { x: anchorX, y: below ? box.bottom : box.top };
    }
  }
  note.style.left = `${left}px`;
  note.style.top = `${top}px`;
  const fromX = from.x;
  const fromY = from.y;
  const toX = to.x;
  const toY = to.y;

  leader.setAttribute('width', viewWidth());
  leader.setAttribute('height', window.innerHeight);
  leader.innerHTML = `<path d="M${fromX},${fromY} L${toX},${toY}"/>
    <circle cx="${toX}" cy="${toY}" r="3"/>`;
  leader.style.display = '';
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(place);
}

// While a note or a step is up, any change to the page may have taken its
// element away or moved it, without the pointer moving.
let watcher = null;

function watch(running) {
  if (running && !watcher && typeof MutationObserver === 'function') {
    // Its own drawing is not a change to the page: redrawing the leader on
    // every change it caused would never stop.
    const own = node => (note && note.contains(node)) || (leader && leader.contains(node))
      || (shield && shield.contains(node));
    watcher = new MutationObserver(records => {
      if (records.every(record => own(record.target))) return;
      schedule();
      placeStep();
    });
    watcher.observe(document.body, { childList: true, subtree: true });
  } else if (!running && watcher) {
    watcher.disconnect();
    watcher = null;
  }
}

// What a sticky header holds over the page: an element scrolled under it is
// out of sight as much as one scrolled off the screen.
function coveredAbove(target) {
  // Only what scrolls under it: the board and the title row are the sticky
  // part of the plan, the section bar the sticky part of the Data tab.
  const sticky = (target.closest('#plan-sheets') && document.querySelector('#plan .plan-sticky'))
    || (target.closest('#data-page') && !target.closest('.dp-nav')
      && document.querySelector('#data-page .dp-nav'));
  return sticky ? sticky.getBoundingClientRect().bottom : 0;
}

// Whether any of the element is in sight: on the screen, below a sticky
// header, and inside every box that scrolls or clips it.
function inSight(target, box, point = null) {
  if (!box.width && !box.height) return false;
  if (box.bottom < coveredAbove(target) || box.top > window.innerHeight
      || box.right < 0 || box.left > viewWidth()) return false;
  for (let el = target.parentElement; el && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const clip = el.getBoundingClientRect();
    if (box.bottom <= clip.top || box.top >= clip.bottom
        || box.right <= clip.left || box.left >= clip.right) return false;
  }
  return !underLayer(target, box, point);
}

// Whether a layer fixed over the page, such as a dialog the click just opened,
// lies over the element. Only such layers count: a sibling drawn over part of
// a shape, or the sticky block, is not one.
function fixedLayer(el) {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    if (getComputedStyle(node).position === 'fixed') return node;
  }
  return null;
}

function underLayer(target, box, point) {
  const inBox = point && point.x >= box.left && point.x <= box.right
    && point.y >= box.top && point.y <= box.bottom;
  const x = Math.min(viewWidth() - 1, Math.max(0, inBox ? point.x : box.left + box.width / 2));
  const y = Math.min(window.innerHeight - 1, Math.max(0, inBox ? point.y : box.top + box.height / 2));
  const top = document.elementFromPoint(x, y);
  if (!top || target.contains(top) || top.contains(target)) return false;
  const layer = fixedLayer(top);
  return Boolean(layer && !layer.contains(target));
}

// Out of sight for now: the note goes, but stays ready for when the element is
// back, as after the scroll that follows a keyboard focus.
function conceal() {
  if (note) note.hidden = true;
  if (leader) leader.style.display = 'none';
}

function show(hit, x, y, source = 'pointer') {
  if (!on || walking()) return;
  ensureLayers();
  clearTimeout(hideTimer);
  if (source === 'focus') { clearTimeout(showTimer); clearTimeout(passTimer); pendingHit = null; }
  active = { ...hit, x, y, source };
  note.innerHTML = esc(textOf(hit.id));
  note.hidden = false;
  note.classList.remove('demo-step');
  watch(true);
  // Placed at once, not on the next frame: a note is never seen where it is not.
  if (frame) { cancelAnimationFrame(frame); frame = null; }
  place();
}

function hide(now = false) {
  clearTimeout(showTimer);
  pendingHit = null;
  if (now) clearTimeout(passTimer);
  if (shield) return;          // a step on a phone goes with the tap that dismisses it
  const go = () => {
    active = null;
    watch(false);
    if (note) note.hidden = true;
    if (leader) leader.style.display = 'none';
  };
  if (now) go(); else { clearTimeout(hideTimer); hideTimer = setTimeout(go, 120); }
}

function onOver(event) {
  if (!on || narrow()) return;
  const hit = hintAt(event.target);
  if (!hit) {
    if (active && !document.contains(active.target)) hide(true);
    return;
  }
  clearTimeout(hideTimer);
  if (active && active.target === hit.target && active.id === hit.id) return;
  // The field the keyboard is in keeps its note while the mouse passes by, as
  // long as that note is in sight.
  if (active && active.source === 'focus' && note && !note.hidden
      && active.target.contains(document.activeElement)) {
    passedOver = hit;
    return;
  }
  passedOver = null;
  if (!active && pendingHit && pendingHit.target === hit.target && pendingHit.id === hit.id) return;
  clearTimeout(showTimer);
  pendingHit = hit;
  showTimer = setTimeout(() => { pendingHit = null; show(hit, event.clientX, event.clientY); },
    active ? 0 : 180);
}

function onOut(event) {
  if (!active) {
    if (pendingHit && event.relatedTarget && pendingHit.target.contains(event.relatedTarget)) return;
    clearTimeout(showTimer);
    pendingHit = null;
    return;
  }
  // A note shown for keyboard focus stays with the focus, whatever the mouse does.
  if (active.source === 'focus') return;
  if (event.relatedTarget && active.target.contains(event.relatedTarget)) return;
  hide();
}

function onMove(event) {
  if (!active || narrow() || active.source === 'focus') return;
  active.x = event.clientX;
  active.y = event.clientY;
  schedule();
}

// Reached with the keyboard, the same note.
function onFocus(event) {
  if (!on || narrow()) return;
  const hit = hintAt(event.target);
  if (!hit || !event.target.matches(':focus-visible')) return;
  // A text field matches :focus-visible however it was focused; one focused
  // by a press, on it or on an edit button or label beside it, is the
  // pointer's, and keeps the pointer's note.
  if (lastPress && performance.now() - lastPress.at < 600) return;
  // After the browser has scrolled the field into view.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (document.activeElement === event.target || event.target.contains(document.activeElement)) {
      show(hit, undefined, undefined, 'focus');
    }
  }));
}

// ---------------------------------------------------------------------------
// On a phone: over the page, once, until the next tap.

let shield = null;
let stepTarget = null;
let pendingStep = null;

// The ring round the element and the note beside it, where the element is now:
// a soft keyboard or a scroll moves it after the tap.
function placeStep() {
  if (!shield) return;
  const ring = shield.firstChild;
  // Drawn again since the tap: no ring round what is not there, and the note
  // at the top of the screen.
  let gone = !stepTarget || !document.contains(stepTarget) || !stepTarget.getClientRects().length;
  if (!gone) {
    // A layer opened over it since: the hint stays, the ring goes. The shield
    // itself is let through for the test, or it would always be on top.
    shield.style.pointerEvents = 'none';
    gone = underLayer(stepTarget, stepTarget.getBoundingClientRect(), null);
    shield.style.pointerEvents = '';
  }
  ring.style.display = gone ? 'none' : '';
  const view0 = window.visualViewport || { height: window.innerHeight, offsetTop: 0 };
  const box = gone
    ? { left: 0, top: view0.offsetTop, width: 0, height: 0, bottom: view0.offsetTop }
    : stepTarget.getBoundingClientRect();
  Object.assign(ring.style, {
    left: `${box.left - 3}px`, top: `${box.top - 3}px`,
    width: `${box.width + 6}px`, height: `${box.height + 6}px`,
  });
  // Within what the screen shows, even where the page is wider than it.
  const view = window.visualViewport
    || { width: window.innerWidth, height: window.innerHeight, offsetLeft: 0, offsetTop: 0 };
  note.style.width = `${view.width - 24}px`;
  note.style.left = `${view.offsetLeft + 12}px`;
  const height = note.offsetHeight;
  // Below the element when it is in the top half of the screen, above it otherwise.
  // A year's value in the curve editor keeps its note below the row of values
  // and the years under them.
  const rowBox = !gone && stepTarget.matches('.curve-editor-num') && stepTarget.closest('.curve-editor-values');
  const below = Boolean(rowBox) || box.top + box.height / 2 < view.offsetTop + view.height / 2;
  const under = rowBox ? rowBox.getBoundingClientRect().bottom : box.bottom;
  const top = below ? Math.min(view.offsetTop + view.height - height - 12, under + 12)
    : Math.max(view.offsetTop + 12, box.top - height - 12);
  note.style.top = `${top}px`;
}

function step(hit) {
  ensureLayers();
  hide(true);
  clearTimeout(hideTimer);
  seen.add(hit.id);
  stepTarget = hit.target;
  watch(true);
  note.innerHTML = esc(textOf(hit.id));
  note.classList.add('demo-step');
  note.hidden = false;

  const layer = document.createElement('div');
  layer.className = 'demo-shield';
  const ring = document.createElement('div');
  ring.className = 'demo-ring';
  layer.appendChild(ring);
  document.body.appendChild(layer);
  shield = layer;
  placeStep();

  // Put away when the finger or the button comes up. The click that follows
  // would land on whatever is under the shield once it is gone, so it is
  // swallowed. Holding the press itself keeps the focus on the field the hint
  // is about.
  let closed = false;
  const shownAt = performance.now();
  const close = event => {
    event.preventDefault();
    event.stopPropagation();
    // The second half of a double tap is not a reader putting the hint away.
    if (performance.now() - shownAt < 400) return;
    if (closed) return;
    closed = true;
    const swallow = click => { click.preventDefault(); click.stopPropagation(); };
    const disarm = () => document.removeEventListener('click', swallow, { capture: true });
    document.addEventListener('click', swallow, { capture: true, once: true });
    // Only the click of this press: the next press is the reader's own again.
    document.addEventListener('pointerdown', disarm, { capture: true, once: true });
    setTimeout(disarm, 600);
    endStep(layer);
  };
  layer.addEventListener('pointerdown', event => event.preventDefault());
  layer.addEventListener('mousedown', event => event.preventDefault());
  layer.addEventListener('pointerup', close);
  layer.addEventListener('click', close);
}

// The step put away: by its own tap, or by demo mode being switched off.
function endStep(layer = shield) {
  if (layer) layer.remove();
  if (!layer || shield !== layer) return;
  shield = null;
  stepTarget = null;
  watch(false);
  if (note) {
    note.hidden = true;
    note.classList.remove('demo-step');
  }
}

// The element pressed, taken at pointerdown: a drag handle that captures the
// pointer gets the pointerup sent to its container instead.
let pressed = null;
let lastPress = null;        // { target, at }: a focus that follows a press is the mouse's

function onDown(event) {
  lastPress = { target: event.target, at: performance.now() };
  // A second press soon after the first is a double tap or a double-click,
  // which the hint must not get in the way of.
  if (pendingStep) { clearTimeout(pendingStep); pendingStep = null; }
  pressed = on && narrow() ? hintAt(event.target) : null;
}

function onTap(event) {
  if (!on || !narrow() || shield || pendingStep || walking()) return;
  const hit = pressed || hintAt(event.target);
  pressed = null;
  if (!hit || seen.has(hit.id)) return;
  const x = event.clientX;
  const y = event.clientY;
  // After the tap has done what it does: the hint explains it, it does not stop
  // it. By then the tap may have switched demo mode off, shown another step, or
  // drawn the element again, in which case the one now under the finger is it.
  pendingStep = setTimeout(() => {
    pendingStep = null;
    if (!on || shield || seen.has(hit.id)) return;
    if (document.contains(hit.target)) {
      // A dialog the tap opened over it: the hint can wait for another tap.
      // Under a layer the tap opened, such as the calculation window: the hint
      // over it, without a ring round what cannot be seen.
      if (underLayer(hit.target, hit.target.getBoundingClientRect(), { x, y })) {
        step({ id: hit.id, target: null });
        return;
      }
      step(hit);
      return;
    }
    const again = hintAt(document.elementFromPoint(x, y));
    step(again && again.id === hit.id ? again : { id: hit.id, target: null });
  }, 350);
}

// ---------------------------------------------------------------------------

function renderToggle() {
  const button = document.getElementById('demo-toggle');
  if (!button) return;
  button.setAttribute('aria-pressed', String(on));
}

function setOn(value) {
  on = value;
  try { localStorage.setItem(STORE, on ? '1' : '0'); } catch (e) { /* kept for this visit */ }
  if (!on) {
    clearTimeout(pendingStep);
    pendingStep = null;
    pendingHit = null;
    endStep();
    hide(true);
  }
  renderToggle();
}

export function initDemo() {
  try { on = localStorage.getItem(STORE) !== '0'; } catch (e) { on = true; }
  renderToggle();
  const button = document.getElementById('demo-toggle');
  if (button) button.addEventListener('click', () => setOn(!on));

  document.addEventListener('pointerover', onOver);
  document.addEventListener('pointerout', onOut);
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('focusin', onFocus);
  document.addEventListener('focusout', event => {
    if (!active || active.source !== 'focus' || !active.target.contains(event.target)) return;
    // The focus has gone: from here the note is the pointer's, and goes with it.
    active.source = 'pointer';
    hide();
    // The element the pointer went to while the field had its note says its own.
    const waiting = passedOver;
    passedOver = null;
    if (waiting && on && !narrow()) {
      clearTimeout(passTimer);
      passTimer = setTimeout(() => {
        if (!on || narrow() || (active && active.source === 'focus')) return;
        if (document.contains(waiting.target) && waiting.target.matches(':hover')) show(waiting);
      }, 140);
    }
  });
  document.addEventListener('hvStateChanged', schedule);
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('pointerup', onTap);
  window.addEventListener('scroll', () => { schedule(); placeStep(); }, { passive: true, capture: true });
  window.addEventListener('resize', () => { schedule(); placeStep(); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', placeStep);
    window.visualViewport.addEventListener('scroll', placeStep);
  }
  document.addEventListener('languageChanged', () => {
    if (active && note) { note.innerHTML = esc(textOf(active.id)); schedule(); }
  });
}
