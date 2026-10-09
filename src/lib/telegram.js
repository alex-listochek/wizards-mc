import { useEffect, useRef } from 'react';
import { navigate } from './router.jsx';

// Запуск сайта как Telegram Mini App: https://core.telegram.org/bots/webapps
// Скрипт Telegram подгружается только внутри Telegram — обычный сайт работает как раньше.

const SCRIPT = 'https://telegram.org/js/telegram-web-app.js';
// Фон сайта в светлой и тёмной теме — в этот цвет красится шапка Telegram.
const BG = { light: '#ffffff', dark: '#141415' };

// Telegram.WebApp, если сайт открыт в Telegram, иначе null.
export let tg = null;

// На старых версиях Telegram часть методов недоступна — пропускаем их.
const safe = (fn) => {
  try {
    fn();
  } catch {}
};

// Telegram передаёт данные запуска в адресе: #tgWebAppData=…&tgWebAppVersion=…
// После перезагрузки страницы их уже нет в адресе — скрипт Telegram хранит их в sessionStorage.
function launchedInTelegram() {
  if (location.hash.includes('tgWebApp')) return true;
  try {
    return !!JSON.parse(sessionStorage.getItem('__telegram__initParams'))?.tgWebAppVersion;
  } catch {
    return false;
  }
}

const loadScript = (src) =>
  new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = s.onerror = resolve;
    // Если telegram.org не отвечает, открываем сайт без интеграции.
    setTimeout(resolve, 4000);
    document.head.append(s);
  });

// Убираем данные запуска из адреса, иначе роутер примет их за страницу.
// Ссылка t.me/<бот>?startapp=rules_chat открывает статью #/rules/chat.
function cleanUrl() {
  const hash = location.hash.slice(1);
  if (!hash.includes('tgWebApp')) return;
  const q = hash.indexOf('?');
  let path = q > 0 ? hash.slice(0, q) : '/';
  const start = new URLSearchParams(location.search).get('tgWebAppStartParam') || tg?.initDataUnsafe?.start_param;
  if (start && /^[\w-]+$/.test(start)) path = '/' + start.replace('_', '/');
  // Метка первой страницы: «Назад» с неё ведёт на главную.
  history.replaceState({ tgStart: true }, '', `${location.pathname}#${path}`);
}

// Тема сайта повторяет тему Telegram, шапка Telegram — цвета фона сайта.
function applyTheme() {
  const scheme = tg.colorScheme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = scheme;
  safe(() => tg.setHeaderColor(BG[scheme]));
  safe(() => tg.setBackgroundColor(BG[scheme]));
  safe(() => tg.setBottomBarColor(BG[scheme]));
}

// Ссылки t.me открываются в самом Telegram, остальные — во встроенном браузере.
export function openExternal(href) {
  const url = new URL(href, location.href);
  if (!tg) window.open(url.href, '_blank', 'noopener,noreferrer');
  else if (/^(t|telegram)\.me$/i.test(url.hostname)) tg.openTelegramLink(url.href);
  else tg.openLink(url.href);
}

function onLinkClick(e) {
  if (e.defaultPrevented || e.button !== 0) return;
  const a = e.target.closest('a[href]');
  if (!a || !/^https?:$/.test(a.protocol)) return;
  if (a.origin === location.origin && a.target !== '_blank') return;
  e.preventDefault();
  openExternal(a.href);
}

export async function initTelegram() {
  if (!launchedInTelegram()) return;
  await loadScript(SCRIPT);
  const app = window.Telegram?.WebApp;
  if (app && app.platform !== 'unknown') tg = app;
  cleanUrl();
  if (!tg) return;

  applyTheme();
  tg.onEvent('themeChanged', applyTheme);
  tg.expand();
  // Чтобы прокрутка статьи вверх не сворачивала приложение.
  safe(() => tg.disableVerticalSwipes());
  document.addEventListener('click', onLinkClick);
  tg.ready();
}

export function haptic() {
  safe(() => tg?.HapticFeedback.notificationOccurred('success'));
}

// Назад по истории; если статья открыта первой (по ссылке из чата) — на главную.
export function goBack() {
  if (history.state?.tgStart) navigate('/');
  else history.back();
}

// Кнопка «Назад» в шапке Telegram, на Android — и системная «Назад».
export function useBackButton(visible, onBack) {
  const handler = useRef(onBack);
  useEffect(() => {
    handler.current = onBack;
  });

  useEffect(() => {
    if (!tg) return;
    const click = () => handler.current();
    tg.BackButton.onClick(click);
    return () => tg.BackButton.offClick(click);
  }, []);

  useEffect(() => {
    if (!tg) return;
    if (visible) tg.BackButton.show();
    else tg.BackButton.hide();
  }, [visible]);
}
