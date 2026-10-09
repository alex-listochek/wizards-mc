import { useEffect, useState } from 'react';

export default function Toast() {
  const [state, setState] = useState({ text: '', show: false });

  useEffect(() => {
    let timer;
    const onToast = (e) => {
      setState({ text: e.detail, show: true });
      clearTimeout(timer);
      timer = setTimeout(() => setState((s) => ({ ...s, show: false })), 1800);
    };
    window.addEventListener('toast', onToast);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('toast', onToast);
    };
  }, []);

  return (
    <div className={`toast${state.show ? ' show' : ''}`} role="status" aria-live="polite">
      {state.text}
    </div>
  );
}
