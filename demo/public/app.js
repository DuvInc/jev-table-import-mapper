// The same CSV reader the server uses, served straight from `lib/`. The page
// parses the file locally and posts column names plus three sample values per
// column: the rows never leave the browser, and the key never enters it.
import { parseCSV } from '/lib/csv.mjs';

const $ = (id) => document.getElementById(id);
const el = (t, cls, txt) => { const n = document.createElement(t); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

let SCHEMAS = [], current = null, threshold = 0.75, lastFile = null;
const dz = $('drop');

// --- boot --------------------------------------------------------------------
const boot = await fetch('/api/schemas').then((r) => r.json());
SCHEMAS = boot.schemas; threshold = boot.threshold;
$('model').textContent = boot.model;
if (!boot.ready) fail('No OPENROUTER_API_KEY in the environment. The deterministic pass still runs, the model does not. See .env.example.');

const schemaBox = $('schemas');
SCHEMAS.forEach((s) => {
  // A div rather than a <button>: the card holds a button of its own, and a
  // button inside a button is not valid HTML.
  const b = el('div', 'card');
  b.setAttribute('role', 'button'); b.tabIndex = 0; b.setAttribute('aria-pressed', 'false');
  const fieldsBtn = el('button', 'linkbtn'); fieldsBtn.type = 'button';
  fieldsBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" '
    + 'stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8S3.8 3.5 8 3.5 14.5 8 14.5 8'
    + 'S12.2 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/></svg>';
  fieldsBtn.append(el('span', null, 'See fields'));
  fieldsBtn.onclick = (e) => { e.stopPropagation(); showFields(s); };
  b.append(el('b', null, s.name), el('span', null, s.about), fieldsBtn);
  b.onclick = () => select(s.id);
  b.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(s.id); } };
  schemaBox.append(b);
});

// Each column description is what the model reads to tell two neighbouring
// fields apart, so it is worth showing.
function showFields(schema) {
  const t = el('table', 'fieldtable');
  const thead = el('thead'), htr = el('tr');
  ['Column', 'Type', 'What it holds'].forEach((h) => htr.append(el('th', null, h)));
  thead.append(htr); t.append(thead);
  const tb = el('tbody');
  for (const c of schema.columns) {
    const tr = el('tr');
    tr.append(el('td', 'k', c.key), el('td', 'ty', c.type), el('td', 'd', c.desc));
    tb.append(tr);
  }
  t.append(tb);
  openModal({ title: schema.name, node: t, meta: `${schema.columns.length} columns`,
    tip: 'These descriptions are what jev reads to tell two neighbouring fields apart' });
}
// Deep link: ?table=hr_employees&file=hr-payroll.csv reloads a given state, and
// &view=matrix opens the full probability matrix on arrival. Handy for pointing
// somebody at one specific case rather than describing it.
const qs = new URLSearchParams(location.search);
select(SCHEMAS.find((s) => s.id === qs.get('table')) ? qs.get('table') : SCHEMAS[0].id);
if (qs.get('file') && current.samples.includes(qs.get('file')))
  loadSample(qs.get('file')).then((f) => use(f.name, f.text)).catch((e) => fail(e.message));

function select(id) {
  current = SCHEMAS.find((s) => s.id === id);
  [...schemaBox.children].forEach((c, i) => c.setAttribute('aria-pressed', String(SCHEMAS[i].id === id)));
  renderSamples();
  clearFile();
}

// --- samples -----------------------------------------------------------------
function renderSamples() {
  const box = $('samples'); box.textContent = '';
  for (const name of current.samples) {
    const c = el('div', 'chip'); c.draggable = true;
    c.append(el('b', null, name), el('span', null, 'click to preview · drag to use'));
    c.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/x-sample', name);
      e.dataTransfer.effectAllowed = 'copy'; c.classList.add('dragging');
    });
    c.addEventListener('dragend', () => c.classList.remove('dragging'));
    c.addEventListener('click', () => preview(name));
    box.append(c);
  }
}

async function loadSample(name) {
  const d = await fetch(`/api/sample?f=${encodeURIComponent(name)}`).then((r) => r.json());
  if (d.error) throw new Error(d.error);
  return { name, text: d.text };
}

function openModal({ title, node, meta = '', tip = '', wide = false }) {
  $('mTitle').textContent = title;
  $('mBody').textContent = ''; $('mBody').append(node);
  $('mMeta').textContent = meta; $('mTip').textContent = tip;
  $('modal').querySelector('.sheet').classList.toggle('wide', wide);
  $('modal').hidden = false;
}

async function preview(name) {
  const { text } = await loadSample(name);
  const rows = parseCSV(text);
  const t = el('table', 'csvtable');
  const thead = el('thead'), tr = el('tr');
  rows[0].forEach((h) => tr.append(el('th', null, h)));
  thead.append(tr); t.append(thead);
  const tb = el('tbody');
  rows.slice(1).forEach((r) => { const x = el('tr'); r.forEach((v) => x.append(el('td', null, v))); tb.append(x); });
  t.append(tb);
  openModal({ title: name, node: t, meta: `${rows[0].length} columns · ${rows.length - 1} rows`,
    tip: 'Drag the card into the drop zone to use it' });
}
$('mClose').onclick = () => { $('modal').hidden = true; };
$('modal').onclick = (e) => { if (e.target === $('modal')) $('modal').hidden = true; };
addEventListener('keydown', (e) => { if (e.key === 'Escape') $('modal').hidden = true; });

// --- dropzone ----------------------------------------------------------------
['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => {
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; dz.classList.add('over');
}));
['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => {
  if (ev === 'dragleave' && dz.contains(e.relatedTarget)) return;
  dz.classList.remove('over');
}));
dz.addEventListener('drop', async (e) => {
  e.preventDefault();
  const sample = e.dataTransfer.getData('text/x-sample');
  try {
    if (sample) { const f = await loadSample(sample); return use(f.name, f.text, sample); }
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    use(file.name, await file.text());
  } catch (err) { fail(err.message); }
});
$('clear').onclick = clearFile;

function clearFile() {
  lastFile = null;
  const u = new URL(location.href); u.searchParams.delete('file'); history.replaceState(null, '', u);
  dz.classList.remove('filled');
  dz.querySelector('.dz-idle').hidden = false;
  dz.querySelector('.dz-file').hidden = true;
  $('resultStep').hidden = true;
  $('err').hidden = true;
}

async function use(name, text, sample) {
  const u = new URL(location.href);
  u.searchParams.set('table', current.id);
  if (sample) u.searchParams.set('file', sample); else u.searchParams.delete('file');
  history.replaceState(null, '', u);
  const rows = parseCSV(text);
  if (rows.length < 2) return fail('That file has no data rows.');
  lastFile = { name, rows };
  dz.classList.add('filled');
  dz.querySelector('.dz-idle').hidden = true;
  dz.querySelector('.dz-file').hidden = false;
  $('fname').textContent = name;
  $('fmeta').textContent = `${rows[0].length} columns · ${rows.length - 1} rows`;
  await run();
}

// --- mapping -----------------------------------------------------------------
async function run() {
  const [head, ...data] = lastFile.rows;
  const columns = head.map((name, i) => ({ name, samples: data.slice(0, 3).map((r) => r[i] ?? '') }));
  $('resultStep').hidden = false;
  $('stats').innerHTML = '<span class="spin"></span>';
  $('result').textContent = '';
  $('err').hidden = true;
  try {
    const d = await fetch('/api/map', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schema: current.id, filename: lastFile.name, columns }) }).then((r) => r.json());
    if (d.error) throw new Error(d.error);
    render(d, columns);
  } catch (e) { $('stats').textContent = ''; fail(e.message); }
}

const pc = (p) => `${Math.round(p * 100)}%`;

function render(d, columns) {
  const s = d.stats;
  $('stats').textContent = `${s.exact} exact · ${s.questions} questions in ${s.calls === 1 ? 'one call' : s.calls + ' calls'} · ${s.jevMs} ms · `
    + `${s.tokensIn.toLocaleString()} tokens · $${s.cost.toFixed(6)}`;

  const box = $('result'); box.textContent = '';
  let auto = 0;
  for (const col of current.columns) {
    const hit = d.mapping[col.key];
    const row = el('div', 'row');
    const dst = el('div', 'dst'); dst.append(el('span', null, col.key), el('i', null, col.type));
    const src = el('div', 'src');
    const score = el('div', 'score');

    if (hit) {
      auto++;
      src.append(el('span', 'arrow', '←'), el('code', null, hit.source));
      if (hit.method === 'exact') {
        // Nothing to show: a name that landed on a name has no probability.
        score.append(el('span', 'pill exact', 'exact'));
      } else {
        const bar = el('span', 'mini'); const fill = el('i'); bar.append(fill);
        score.append(el('span', 'pill jev', 'jev'), bar, el('span', 'pcv', pc(hit.p)));
        requestAnimationFrame(() => { fill.style.width = pc(hit.p); });
      }
    } else {
      const sel = el('select');
      sel.append(new Option('(leave empty)', ''));
      for (const c of columns) {
        const p = d.matrix[c.name]?.[col.key];
        sel.append(new Option(p == null ? c.name : `${c.name}  (${pc(p)})`, c.name));
      }
      const best = (d.suggestions[col.key] || [])[0];
      const pill = el('span', 'pill', 'manual');
      const val = el('span', 'pcv', best && best.p > 0 ? `max ${pc(best.p)}` : '-');
      sel.onchange = () => {
        const chosen = sel.value;
        row.classList.toggle('set', !!chosen);
        pill.textContent = chosen ? 'set' : 'manual';
        pill.className = 'pill' + (chosen ? ' set' : '');
        const p = chosen ? d.matrix[chosen]?.[col.key] : null;
        val.textContent = chosen ? (p == null ? 'by hand' : `was ${pc(p)}`) : (best && best.p > 0 ? `max ${pc(best.p)}` : '-');
        $('stats').firstChild && retally();
      };
      src.append(el('span', 'arrow', '←'), sel);
      score.append(pill, val);
    }
    row.append(dst, src, score);
    box.append(row);
  }

  if (d.ignored.length) {
    // The guard question, "is there no home at all for this column?", is the
    // number that warns you. A dropped column whose guard is LOW was not
    // dropped for having nowhere to go, it was dropped because no pair cleared
    // the threshold. That is the one to look at.
    const flagged = d.ignored.filter((n) => (d.orphan[n] ?? 1) < 0.5);
    box.append(el('p', 'sub', `Not imported: ${d.ignored.length} column${d.ignored.length > 1 ? 's' : ''}`));
    const tags = el('div', 'tags');
    for (const n of d.ignored) {
      const o = d.orphan[n];
      const low = o != null && o < 0.5;
      const t = el('span', 'tag' + (low ? ' flag' : ''), n);
      if (low) {
        const best = current.columns.map((c) => ({ k: c.key, p: d.matrix[n]?.[c.key] ?? 0 }))
          .sort((x, y) => y.p - x.p)[0];
        t.append(el('em', null, best ? `probably ${best.k} at ${pc(best.p)}, under the bar` : 'probably belongs somewhere'));
      } else if (o != null) t.append(el('em', null, pc(o)));
      tags.append(t);
    }
    box.append(tags);
    if (flagged.length) box.append(el('p', 'note',
      `${flagged.length === 1 ? 'One column was' : `${flagged.length} columns were`} dropped although jev says `
      + `${flagged.length === 1 ? 'it has' : 'they have'} a home in the schema; the best pair simply fell under ${pc(threshold)}.`));
  }

  const btn = el('button', 'matrixbtn'); btn.type = 'button';
  btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" '
    + 'stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5H13.5V6.5M6.5 13.5H2.5V9.5'
    + 'M13.5 2.5 9 7M2.5 13.5 7 9"/></svg>';
  btn.append(el('span', null, 'View matrix'));
  btn.onclick = () => openModal({ title: 'Every probability', node: heat(d, columns), wide: true,
    meta: `${columns.length} incoming × ${current.columns.length} destination`
      + ` · ${d.stats.questions} questions · ${d.stats.calls === 1 ? 'one call' : d.stats.calls + ' calls'}`,
    tip: '= locked on the name alone · blank = never asked, that destination was already taken' });
  box.append(btn);
  if (qs.get('view') === 'matrix') btn.click();
  const tail = $('stats').textContent;
  window.retally = () => {
    const byHand = [...box.querySelectorAll('select')].filter((s) => s.value).length;
    $('stats').textContent = `${auto + byHand}/${current.columns.length} mapped`
      + (byHand ? ` (${byHand} by hand)` : '') + ` · ${tail}`;
  };
  retally();
}

function heat(d, columns) {
  const wrap = el('div', 'heat'), t = el('table');
  const thead = el('thead'), htr = el('tr');
  htr.append(el('th'));
  for (const c of current.columns) { const th = el('th'); th.append(el('div', null, c.key)); htr.append(th); }
  thead.append(htr); t.append(thead);
  const tb = el('tbody');
  for (const col of columns) {
    const tr = el('tr'); tr.append(el('th', null, col.name));
    for (const c of current.columns) {
      const p = d.matrix[col.name]?.[c.key];
      const locked = d.mapping[c.key]?.source === col.name && d.mapping[c.key].method === 'exact';
      const td = el('td', null, locked ? '=' : p == null ? '' : Math.round(p * 100));
      const v = locked ? 1 : (p ?? 0);
      td.style.background = `color-mix(in oklab, var(--accent) ${Math.round(v * 78)}%, transparent)`;
      td.style.color = v > 0.55 ? 'var(--panel)' : 'var(--muted)';
      if (p != null && p >= threshold) td.style.fontWeight = '500';
      tr.append(td);
    }
    tb.append(tr);
  }
  t.append(tb); wrap.append(t);
  return wrap;
}

function fail(m) { const e = $('err'); e.textContent = m; e.hidden = false; }
