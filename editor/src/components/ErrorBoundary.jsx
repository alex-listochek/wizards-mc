import { Component } from 'react';

/**
 * Ошибка при отрисовке не должна оставлять белый экран: показываем, что случилось, и даём перезагрузить.
 * Несохранённые правки лежат в localStorage — после перезагрузки они вернутся.
 * resetKey — при его смене (например, переход на другую страницу) пробуем отрисовать снова.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[editor]', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="splash error">
        <h1>Что-то пошло не так</h1>
        <p>Несохранённые правки не пропали — они вернутся после перезагрузки страницы.</p>
        <pre className="error-details">{String(this.state.error?.message || this.state.error)}</pre>
        <div className="inline">
          <button className="btn primary" onClick={() => location.reload()}>
            Перезагрузить страницу
          </button>
          <a className="btn" href="#/" onClick={() => this.setState({ error: null })}>
            На главную редактора
          </a>
        </div>
      </div>
    );
  }
}
