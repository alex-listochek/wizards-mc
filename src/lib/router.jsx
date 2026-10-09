import { useEffect, useMemo, useState } from 'react';

// Маршруты через hash: #/раздел/статья#заголовок — работает на любом статическом хостинге.

const decode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const currentPath = () => decode(window.location.hash.slice(1)) || '/';

export function useRoute() {
  // Новый объект на каждое событие, чтобы повторный клик по той же ссылке тоже срабатывал.
  const [state, setState] = useState(() => ({ path: currentPath() }));

  useEffect(() => {
    const onChange = () => setState({ path: currentPath() });
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return useMemo(() => {
    const [path, anchor] = state.path.split('#');
    const [section, slug] = path.split('/').filter(Boolean);
    return { section, slug, anchor: anchor || null };
  }, [state]);
}

export function navigate(to) {
  if (currentPath() === to) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = to;
}

export function Link({ to, onClick, ...props }) {
  return (
    <a
      href={`#${to}`}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
      {...props}
    />
  );
}
