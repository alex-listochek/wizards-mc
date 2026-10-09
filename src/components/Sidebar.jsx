import { useEffect, useRef } from 'react';
import { sections } from '../lib/content.js';
import { Link } from '../lib/router.jsx';

export default function Sidebar({ open, current, onClose }) {
  const ref = useRef(null);

  // Текущая статья всегда видна в меню — и в боковой колонке, и в выезжающем меню на телефоне.
  useEffect(() => {
    const nav = ref.current;
    const el = nav?.querySelector('.nav-link.active');
    if (!el) return;
    const top = el.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop;
    if (top < nav.scrollTop || top > nav.scrollTop + nav.clientHeight - el.offsetHeight) {
      nav.scrollTop = top - nav.clientHeight / 2;
    }
  }, [current, open]);

  return (
    <>
      {open && <div className="scrim" onClick={onClose} />}
      <nav className={`sidebar${open ? ' open' : ''}`} aria-label="Разделы" ref={ref}>
        {sections.map((s) => (
          <div className="nav-section" key={s.id}>
            <div className="nav-title">
              <span className="nav-icon">{s.icon}</span>
              {s.title}
            </div>
            <ul className="nav-list">
              {s.articles.map((a) => (
                <li key={a.path}>
                  <Link
                    to={a.path}
                    className={`nav-link${a === current ? ' active' : ''}`}
                    aria-current={a === current ? 'page' : undefined}
                  >
                    {a.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
