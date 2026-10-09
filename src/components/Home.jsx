import { useEffect } from 'react';
import { server } from '../config.js';
import { sections } from '../lib/content.js';
import { Link } from '../lib/router.jsx';
import Connect from './Connect.jsx';
import { SearchIcon } from './Icons.jsx';

export default function Home({ onSearch }) {
  useEffect(() => {
    document.title = `${server.name} — база знаний`;
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="home">
      <section className="hero">
        <div className="eyebrow">База знаний</div>
        <h1>{server.name}</h1>
        {server.tagline && <p>{server.tagline}</p>}

        {server.startArticle && (
          <Link to={server.startArticle} className="hero-start">
            Впервые на сервере? Первые шаги →
          </Link>
        )}

        <button className="hero-search" onClick={onSearch}>
          <SearchIcon />
          <span>Команда, правило, раса, чар…</span>
        </button>

        {server.addresses.length > 0 && <Connect />}

        {server.links.length > 0 && (
          <div className="hero-actions">
            {server.links.map((l) => (
              <a className="btn" href={l.url} target="_blank" rel="noopener noreferrer" key={l.url}>
                {l.label}
              </a>
            ))}
          </div>
        )}
      </section>

      <div className="cards">
        {sections.map((s) => (
          <section className="card" key={s.id}>
            <div className="card-head">
              <span className="card-icon">{s.icon}</span>
              <h2>{s.title}</h2>
            </div>
            {s.description && <p>{s.description}</p>}
            <ul>
              {s.articles.map((a) => (
                <li key={a.path}>
                  <Link to={a.path}>{a.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
