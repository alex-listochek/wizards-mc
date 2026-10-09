import { useEffect, useState } from 'react';
import { NewArticleDialog } from './components/ArticleDialogs.jsx';
import ArticleEditor from './components/ArticleEditor.jsx';
import Dashboard from './components/Dashboard.jsx';
import { ConfirmHost } from './components/Modal.jsx';
import SearchDialog from './components/SearchDialog.jsx';
import SectionsPage from './components/SectionsPage.jsx';
import Sidebar from './components/Sidebar.jsx';
import SitePage from './components/SitePage.jsx';
import Toasts from './components/Toasts.jsx';
import TrashPage from './components/TrashPage.jsx';
import { plural, toast, usePref, useRoute } from './lib/util.js';
import { getState, load, useStore } from './store.js';

function useTheme() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('editor-theme', next);
    } catch {}
    setTheme(next);
  };
  return [theme, toggle];
}

export default function App() {
  const state = useStore();
  const route = useRoute();
  const [theme, toggleTheme] = useTheme();
  const [siteUrl, setSiteUrl] = usePref('site-url', 'http://localhost:5173/');
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    load({ initial: true })
      .then(({ restored }) => {
        if (restored) toast(`Восстановлены несохранённые правки: ${restored} ${plural(restored, 'статья', 'статьи', 'статей')}`);
      })
      .catch(() => {});
  }, []);

  // Файлы изменили в другой программе — перечитываем.
  useEffect(() => {
    if (!import.meta.hot) return;
    const on = () => load().catch((e) => toast(e.message, 'error'));
    import.meta.hot.on('wiki:changed', on);
    return () => import.meta.hot.off?.('wiki:changed', on);
  }, []);

  // Браузер спросит подтверждение, если закрыть вкладку с несохранёнными правками.
  useEffect(() => {
    const on = (e) => {
      if (Object.keys(getState().drafts).length) e.preventDefault();
    };
    window.addEventListener('beforeunload', on);
    return () => window.removeEventListener('beforeunload', on);
  }, []);

  useEffect(() => {
    const on = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if ((mod && e.code === 'KeyP') || (mod && e.shiftKey && e.code === 'KeyF')) {
        e.preventDefault();
        setDialog('search');
      } else if (e.altKey && e.code === 'KeyN') {
        e.preventDefault();
        setDialog({ type: 'new' });
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  if (state.status === 'loading') return <div className="splash">Загружаю статьи…</div>;
  if (state.status === 'error') {
    return (
      <div className="splash error">
        <h1>Не удалось загрузить статьи</h1>
        <p>{state.error}</p>
        <button className="btn primary" onClick={() => load({ initial: true }).catch(() => {})}>
          Попробовать ещё раз
        </button>
      </div>
    );
  }

  const openNew = (section) => setDialog({ type: 'new', section });

  let page;
  if (route.page === 'edit') page = <ArticleEditor articleKey={route.key} state={state} theme={theme} siteUrl={siteUrl} />;
  else if (route.page === 'sections') page = <SectionsPage state={state} />;
  else if (route.page === 'site') page = <SitePage state={state} />;
  else if (route.page === 'trash') page = <TrashPage />;
  else page = <Dashboard state={state} onNew={openNew} onSearch={() => setDialog('search')} siteUrl={siteUrl} />;

  return (
    <div className="app">
      <Sidebar
        state={state}
        route={route}
        onNew={openNew}
        onSearch={() => setDialog('search')}
        siteUrl={siteUrl}
        onSiteUrl={setSiteUrl}
        theme={theme}
        onTheme={toggleTheme}
      />
      <main className="workspace">{page}</main>
      {dialog === 'search' && <SearchDialog onClose={() => setDialog(null)} />}
      {dialog?.type === 'new' && <NewArticleDialog section={dialog.section ?? (route.page === 'edit' ? route.key.split('/')[0] : undefined)} onClose={() => setDialog(null)} />}
      <ConfirmHost />
      <Toasts />
    </div>
  );
}
