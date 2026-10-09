import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icons.jsx';

export function Modal({ title, onClose, children, footer, width = 520, className = '' }) {
  const box = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    // Фокус на первое поле, иначе на само окно.
    const first = box.current?.querySelector('[autofocus], input, textarea, select');
    (first ?? box.current)?.focus();
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${className}`} style={{ width }} role="dialog" aria-modal="true" aria-label={title} ref={box} tabIndex={-1}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть" title="Закрыть (Esc)">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Подтверждение: await confirmDialog({...}) → true/false ----------

let showConfirm = null;

export function confirmDialog(options) {
  return new Promise((resolve) => (showConfirm ? showConfirm({ ...options, resolve }) : resolve(window.confirm(options.message))));
}

export function ConfirmHost() {
  const [req, setReq] = useState(null);
  useEffect(() => {
    showConfirm = setReq;
    return () => {
      showConfirm = null;
    };
  }, []);
  if (!req) return null;
  const done = (ok) => {
    setReq(null);
    req.resolve(ok);
  };
  return (
    <Modal
      title={req.title}
      onClose={() => done(false)}
      width={440}
      footer={
        <>
          <button className="btn" onClick={() => done(false)}>
            {req.cancelText ?? 'Отмена'}
          </button>
          <button className={`btn ${req.danger ? 'danger' : 'primary'}`} onClick={() => done(true)} autoFocus>
            {req.confirmText ?? 'OK'}
          </button>
        </>
      }
    >
      <div className="confirm-text">{req.message}</div>
    </Modal>
  );
}
