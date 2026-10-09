import { useEffect, useMemo, useRef, useState } from 'react';
import { editPath, go, setJump } from '../lib/util.js';
import { buildSections, useStore } from '../store.js';
import Icon from './Icons.jsx';
import { Modal } from './Modal.jsx';

// Регистр и ё не важны. Длина строки при этом не меняется, поэтому позиции совпадений верны и в исходном тексте.
const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');
const MAX_TEXT = 300;

function snippet(body, from, to) {
  const lineStart = body.lastIndexOf('\n', from - 1) + 1;
  let lineEnd = body.indexOf('\n', to);
  if (lineEnd === -1) lineEnd = body.length;
  const start = Math.max(lineStart, from - 60);
  const end = Math.min(lineEnd, to + 90);
  return {
    before: (start > lineStart ? '…' : '') + body.slice(start, from),
    match: body.slice(from, to),
    after: body.slice(to, end) + (end < lineEnd ? '…' : ''),
    line: body.slice(0, from).split('\n').length,
  };
}

/** Поиск по названиям и текстам всех статей, включая несохранённые правки. */
export default function SearchDialog({ onClose }) {
  const state = useStore();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef(null);

  const results = useMemo(() => {
    const query = norm(q.trim());
    if (!query) return [];
    const out = [];
    const sections = buildSections(state);
    for (const s of sections) {
      for (const a of s.articles) {
        const cur = state.drafts[a.key] ?? state.articles[a.key];
        if (norm(`${a.title} ${cur.fields.description} ${a.key}`).includes(query)) {
          out.push({ type: 'article', key: a.key, title: a.title, icon: s.icon, description: cur.fields.description });
        }
      }
    }
    if (query.length < 2) return out;
    let total = 0;
    for (const s of sections) {
      for (const a of s.articles) {
        const body = (state.drafts[a.key] ?? state.articles[a.key]).body;
        const nb = norm(body);
        const hits = [];
        for (let i = nb.indexOf(query); i !== -1 && total < MAX_TEXT; i = nb.indexOf(query, i + query.length)) {
          hits.push({ type: 'text', key: a.key, from: i, to: i + query.length, ...snippet(body, i, i + query.length) });
          total++;
        }
        if (hits.length) out.push({ type: 'group', key: a.key, title: a.title, icon: s.icon, count: hits.length }, ...hits);
      }
    }
    return out;
  }, [q, state]);

  const selectable = results.filter((r) => r.type !== 'group');
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const open = (r) => {
    if (r.type === 'text') setJump(r.key, r.from, r.to);
    onClose();
    go(editPath(r.key));
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(selectable.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && selectable[active]) {
      e.preventDefault();
      open(selectable[active]);
    }
  };

  const textCount = results.filter((r) => r.type === 'text').length;

  return (
    <Modal title="Поиск по базе знаний" onClose={onClose} width={680} className="picker-modal search-modal">
      <div className="picker-search">
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Название статьи или слово в тексте…" autoFocus />
      </div>
      <div className="picker-list" ref={list}>
        {results.map((r) => {
          if (r.type === 'group') {
            return (
              <div key={`g-${r.key}`} className="search-group">
                <span>{r.icon}</span> {r.title} <span className="muted small">· {r.count}</span>
              </div>
            );
          }
          const i = selectable.indexOf(r);
          return r.type === 'article' ? (
            <div key={`a-${r.key}`} className={`picker-row article${i === active ? ' active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => open(r)}>
              <span className="picker-icon">{r.icon}</span>
              <span className="picker-title">{r.title}</span>
              <span className="picker-path">{r.description}</span>
            </div>
          ) : (
            <div key={`t-${r.key}-${r.from}`} className={`picker-row text${i === active ? ' active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => open(r)}>
              <span className="search-line">{r.line}</span>
              <span className="search-snippet">
                {r.before}
                <mark>{r.match}</mark>
                {r.after}
              </span>
            </div>
          );
        })}
        {q.trim() && !results.length && <div className="empty-note">Ничего не нашлось</div>}
        {!q.trim() && <div className="empty-note">Ищет по названиям, описаниям и тексту всех статей, включая несохранённые правки.</div>}
      </div>
      {textCount >= MAX_TEXT && <div className="picker-foot muted small">Показаны первые {MAX_TEXT} совпадений — уточните запрос.</div>}
    </Modal>
  );
}
