import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../lib/router.jsx';
import { normalize, queryTerms, search } from '../lib/search.js';
import { SearchIcon } from './Icons.jsx';

function Highlight({ text, terms }) {
  if (!text || !terms.length) return text;
  const n = normalize(text);
  const ranges = [];
  for (const t of terms) {
    for (let i = n.indexOf(t); i !== -1; i = n.indexOf(t, i + t.length)) ranges.push([i, i + t.length]);
  }
  if (!ranges.length) return text;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  const out = [];
  let pos = 0;
  merged.forEach(([s, e], k) => {
    if (s > pos) out.push(text.slice(pos, s));
    out.push(<mark key={k}>{text.slice(s, e)}</mark>);
    pos = e;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

export default function Search({ onClose }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const results = useMemo(() => search(query), [query]);
  const terms = useMemo(() => queryTerms(query), [query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const open = (r) => {
    onClose();
    navigate(r.to);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      open(results[active]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search" role="dialog" aria-modal="true" aria-label="Поиск">
        <div className="search-input-row">
          <SearchIcon />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Команда, правило, раса, чар…"
            enterKeyHint="search"
            aria-label="Поиск по базе знаний"
            spellCheck={false}
          />
          <button className="esc-btn" onClick={onClose} aria-label="Закрыть поиск">
            <span className="esc-key">Esc</span>
            <span className="esc-text">Отмена</span>
          </button>
        </div>

        {!terms.length ? (
          <div className="search-empty">Ищем по заголовкам и тексту всех статей</div>
        ) : results.length === 0 ? (
          <div className="search-empty">Ничего не найдено по запросу «{query.trim()}»</div>
        ) : (
          <ul className="search-results" ref={listRef}>
            {results.map((r, i) => (
              <li key={r.to}>
                <a
                  href={`#${r.to}`}
                  className={`result${i === active ? ' active' : ''}`}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={(e) => {
                    e.preventDefault();
                    open(r);
                  }}
                >
                  <div className="result-path">
                    {r.section.icon} {r.section.title}
                  </div>
                  <div className="result-title">
                    <Highlight text={r.article.title} terms={terms} />
                    {r.heading && (
                      <>
                        <span className="result-sep">›</span>
                        <Highlight text={r.heading} terms={terms} />
                      </>
                    )}
                  </div>
                  {r.snippet && (
                    <div className="result-snippet">
                      <Highlight text={r.snippet} terms={terms} />
                    </div>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="search-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> выбрать
          </span>
          <span>
            <kbd>Enter</kbd> открыть
          </span>
          <span>
            <kbd>Esc</kbd> закрыть
          </span>
        </div>
      </div>
    </div>
  );
}
