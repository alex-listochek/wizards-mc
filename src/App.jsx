import { useEffect, useState } from 'react';
import Article from './components/Article.jsx';
import Header from './components/Header.jsx';
import Home from './components/Home.jsx';
import Search from './components/Search.jsx';
import Sidebar from './components/Sidebar.jsx';
import Toast from './components/Toast.jsx';
import { server } from './config.js';
import { findArticle } from './lib/content.js';
import { Link, useRoute } from './lib/router.jsx';
import { goBack, tg, useBackButton } from './lib/telegram.js';

const isTyping = (el) => el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

function useTheme() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    // Цвет панели браузера на телефоне — под выбранную тему.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.content = next === 'dark' ? '#141415' : '#ffffff';
    });
    try {
      localStorage.setItem('theme', next);
    } catch {}
    setTheme(next);
  };
  return [theme, toggle];
}

function NotFound() {
  useEffect(() => {
    document.title = `Страница не найдена — ${server.name}`;
  }, []);
  return (
    <div className="not-found">
      <h1>Страница не найдена</h1>
      <p>Возможно, статью переименовали или удалили. Попробуйте поиск.</p>
      <Link to="/" className="btn">
        На главную
      </Link>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const [theme, toggleTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const article = route.section ? findArticle(route.section, route.slug) : null;

  // В Telegram «Назад» сначала закрывает поиск и меню, потом возвращает на прошлую страницу.
  useBackButton(Boolean(route.section || menuOpen || searchOpen), () => {
    if (searchOpen) setSearchOpen(false);
    else if (menuOpen) setMenuOpen(false);
    else goBack();
  });

  useEffect(() => setMenuOpen(false), [route]);
  useEffect(() => {
    document.body.classList.toggle('lock', menuOpen);
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      } else if (e.key === '/' && !isTyping(e.target)) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  let page;
  if (!route.section) page = <Home onSearch={() => setSearchOpen(true)} />;
  else if (article) page = <Article article={article} route={route} />;
  else page = <NotFound />;

  return (
    <>
      <Header
        onMenu={() => setMenuOpen((o) => !o)}
        onSearch={() => setSearchOpen(true)}
        theme={theme}
        // В Telegram тема переключается вместе с темой самого Telegram.
        onTheme={tg ? null : toggleTheme}
      />
      <div className="layout">
        <Sidebar open={menuOpen} current={article} onClose={() => setMenuOpen(false)} />
        <main className="main">{page}</main>
      </div>
      {searchOpen && <Search onClose={() => setSearchOpen(false)} />}
      <Toast />
    </>
  );
}
