import { useEffect, useRef, useState } from 'react';
import { Link, navigate } from '../lib/router.jsx';
import { ChevronIcon, ListIcon } from './Icons.jsx';

// Заголовок, который сейчас читают.
export function useActiveHeading(headings) {
  const [active, setActive] = useState(null);

  useEffect(() => {
    const update = () => {
      let current = null;
      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top < 130) current = h.id;
        else break;
      }
      setActive(current);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [headings]);

  return active;
}

const HeadingLinks = ({ article, active, onPick }) =>
  article.headings.map((h) => (
    <Link
      key={h.id}
      to={`${article.path}#${h.id}`}
      className={`depth-${h.depth}${h.id === active ? ' active' : ''}`}
      onClick={onPick}
    >
      {h.text}
    </Link>
  ));

// Оглавление справа — на широких экранах.
export function Toc({ article, active }) {
  const ref = useRef(null);

  // Длинное оглавление (например, у рас) прокручивается вслед за чтением.
  useEffect(() => {
    const box = ref.current;
    const el = box?.querySelector('a.active');
    if (!el) return;
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = top - box.clientHeight / 3;
    }
  }, [active]);

  if (article.headings.length < 2) return <aside className="toc" />;
  return (
    <aside className="toc" aria-label="Содержание" ref={ref}>
      <div className="toc-title">На этой странице</div>
      <nav className="toc-list">
        <HeadingLinks article={article} active={active} />
      </nav>
    </aside>
  );
}

// Липкая плашка «Содержание» — на телефонах и планшетах, где оглавления справа нет.
export function MobileToc({ article, active }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => setOpen(false), [article]);

  useEffect(() => {
    if (!open) return;
    // В длинном списке (например, 45 рас) сразу показываем текущий раздел.
    const panel = ref.current?.querySelector('.mtoc-panel');
    const el = panel?.querySelector('a.active');
    if (el) panel.scrollTop = el.offsetTop - panel.clientHeight / 2;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (article.headings.length < 2) return null;
  const current = article.headings.find((h) => h.id === active);

  return (
    <div className={`mtoc${open ? ' open' : ''}`} ref={ref}>
      <button className="mtoc-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ListIcon />
        <span className="mtoc-current">{current ? current.text : 'Содержание'}</span>
        <ChevronIcon />
      </button>
      {open && (
        <nav className="mtoc-panel" aria-label="Содержание">
          <button
            className="mtoc-top"
            onClick={() => {
              setOpen(false);
              navigate(article.path);
            }}
          >
            ↑ К началу статьи
          </button>
          <HeadingLinks article={article} active={active} onPick={() => setOpen(false)} />
        </nav>
      )}
    </div>
  );
}
