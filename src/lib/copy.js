export async function copy(text, message = 'Скопировано') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Запасной вариант для http:// и старых браузеров.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  window.dispatchEvent(new CustomEvent('toast', { detail: message }));
}
