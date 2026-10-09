import { useEffect, useRef, useState } from 'react';
import { server } from '../config.js';
import { Link } from '../lib/router.jsx';
import Connect from './Connect.jsx';
import { ChevronIcon, Logo, MenuIcon, MoonIcon, SearchIcon, ServerIcon, SunIcon } from './Icons.jsx';

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

// Кнопка «IP»: открывает адреса Java и Bedrock с кнопками копирования.
function IpMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`ip-menu${open ? ' open' : ''}`} ref={ref}>
      <button className="ip-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Адрес сервера">
        <ServerIcon />
        <span>IP</span>
        <ChevronIcon />
      </button>
      {open && (
        <div className="ip-popover">
          <Connect onHelp={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

export default function Header({ onMenu, onSearch, theme, onTheme }) {
  return (
    <header className="header">
      <button className="icon-btn burger" onClick={onMenu} aria-label="Меню">
        <MenuIcon />
      </button>

      <Link to="/" className="brand">
        <Logo />
        <span>{server.name}</span>
      </Link>

      <button className="search-btn" onClick={onSearch} aria-label="Поиск">
        <SearchIcon />
        <span>Поиск</span>
        <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>

      <div className="header-right">
        {server.addresses.length > 0 && <IpMenu />}
        <button
          className="icon-btn"
          onClick={onTheme}
          aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </header>
  );
}
