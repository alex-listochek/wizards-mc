import { useEffect, useState } from 'react';
import Icon from './Icons.jsx';

let nextId = 1;

export default function Toasts() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const on = (e) => {
      const id = nextId++;
      setItems((list) => [...list.slice(-3), { id, ...e.detail }]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), e.detail.type === 'error' ? 7000 : 3000);
    };
    window.addEventListener('editor-toast', on);
    return () => window.removeEventListener('editor-toast', on);
  }, []);

  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.type === 'error' ? <Icon name="alert" /> : t.type === 'success' ? <Icon name="check" /> : null}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
