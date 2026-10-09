import { useEffect, useMemo } from 'react';
import { server } from '../config.js';
import { allArticles, articleHtml, sectionById } from '../lib/content.js';
import { copy } from '../lib/copy.js';
import { Link, navigate } from '../lib/router.jsx';
import { openExternal } from '../lib/telegram.js';
import { MobileToc, Toc, useActiveHeading } from './Toc.jsx';

const formatDate = (s) => {
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function Article({ article, route }) {
  const html = useMemo(() => articleHtml(article), [article]);
  const section = sectionById[article.section];
  const i = allArticles.indexOf(article);
  const prev = allArticles[i - 1];
  const next = allArticles[i + 1];
  const active = useActiveHeading(article.headings);

  useEffect(() => {
    document.title = `${article.title} — ${server.name}`;
  }, [article]);

  // Прокрутка к заголовку из ссылки или наверх при смене статьи.
  useEffect(() => {
    const el = route.anchor && document.getElementById(route.anchor);
    if (el) {
      el.scrollIntoView();
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    } else {
      window.scrollTo(0, 0);
    }
  }, [route]);

  const onClick = (e) => {
    const btn = e.target.closest('.copy-btn');
    if (btn) {
      copy(btn.parentElement.querySelector('code').textContent.trimEnd());
      return;
    }
    // Картинки в таблицах и тексте открываются в полном размере.
    if (e.target.tagName === 'IMG' && !e.target.closest('a')) {
      openExternal(e.target.src);
      return;
    }
    const cmd = e.target.closest('code.cmd');
    if (cmd) {
      copy(cmd.textContent, `Скопировано: ${cmd.textContent}`);
      return;
    }
    // Ссылки на заголовки внутри статьи: [текст](#заголовок)
    const link = e.target.closest('a[href^="#"]');
    if (link && !link.getAttribute('href').startsWith('#/')) {
      e.preventDefault();
      navigate(`${article.path}${link.getAttribute('href')}`);
    }
  };

  return (
    <div className="page">
      <article className="article">
        <div className="crumbs">
          <span>{section.icon}</span>
          <span>{section.title}</span>
        </div>
        <h1 className="title">{article.title}</h1>
        {article.description && <p className="lead">{article.description}</p>}
        {article.updated && <div className="meta">Обновлено {formatDate(article.updated)}</div>}

        <MobileToc article={article} active={active} />
        <div className="prose" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />

        {(prev || next) && (
          <nav className="pager">
            {prev && (
              <Link to={prev.path} className="prev">
                <small>← Назад</small>
                {prev.title}
              </Link>
            )}
            {next && (
              <Link to={next.path} className="next">
                <small>Далее →</small>
                {next.title}
              </Link>
            )}
          </nav>
        )}
      </article>
      <Toc article={article} active={active} />
    </div>
  );
}
