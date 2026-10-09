import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { editPath, formatTime, go, toast } from '../lib/util.js';
import { restoreFromTrash } from '../store.js';
import Icon from './Icons.jsx';

export default function TrashPage() {
  const [items, setItems] = useState(null);

  const refresh = () =>
    api
      .trash()
      .then(({ items }) => setItems(items))
      .catch((e) => toast(e.message, 'error'));

  useEffect(() => {
    document.title = 'Корзина — редактор';
    refresh();
  }, []);

  const restore = async (it) => {
    try {
      const key = await restoreFromTrash(it.id);
      toast('Статья восстановлена', 'success');
      go(editPath(key));
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="page-wrap narrow">
      <header className="page-head">
        <div>
          <h1>Корзина</h1>
          <p className="muted">
            Удалённые статьи. Файлы лежат в папке <code>editor/.trash</code> — восстановленная статья вернётся на прежний адрес.
          </p>
        </div>
      </header>
      <section className="panel">
        {items === null && <div className="empty-note">Загружаю…</div>}
        {items?.length === 0 && <div className="empty-note">Корзина пуста</div>}
        <ul className="plain-list trash-list">
          {items?.map((it) => (
            <li key={it.id}>
              <div>
                <div>{it.title}</div>
                <div className="muted small">
                  #/{it.section}/{it.slug} · удалена {formatTime(it.time)}
                </div>
              </div>
              <button className="btn small" onClick={() => restore(it)}>
                <Icon name="restore" size={14} /> Восстановить
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
