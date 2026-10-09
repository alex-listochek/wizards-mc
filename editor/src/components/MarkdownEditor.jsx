import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Annotation, EditorState, Prec, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  placeholder,
  rectangularSelection,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { useEffect, useImperativeHandle, useRef } from 'react';
import { insertImage, toggleWrap } from '../lib/commands.js';

// Изменение пришло снаружи (файл перечитан с диска) — не считаем его правкой пользователя.
const External = Annotation.define();

// Состояние редактора каждой статьи: история отмены, курсор и прокрутка сохраняются при переключении статей.
const saved = new Map();

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', fontSize: '1.3em' },
  { tag: t.heading2, fontWeight: '700', fontSize: '1.18em' },
  { tag: t.heading3, fontWeight: '650', fontSize: '1.07em' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '650' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, color: 'var(--text-3)' },
  { tag: t.monospace, color: 'var(--code-fg)' },
  { tag: t.quote, color: 'var(--text-2)' },
  { tag: [t.processingInstruction, t.contentSeparator], color: 'var(--markup)' },
  { tag: [t.angleBracket, t.tagName, t.attributeName, t.attributeValue], color: 'var(--html)' },
]);

// Цветовые коды Minecraft (&b) и плашки ([!NOTE]) подсвечиваем прямо в тексте.
const mcDecorator = new MatchDecorator({
  regexp: /(?<![a-z0-9])&([0-9a-fr])(?![a-z0-9]*;)/gi,
  decoration: (m) => Decoration.mark({ class: `cm-mc cm-mc-${m[1].toLowerCase()}` }),
});
const calloutDecorator = new MatchDecorator({
  regexp: /\[!(NOTE|TIP|WARNING|DANGER)\]/gi,
  decoration: (m) => Decoration.mark({ class: `cm-callout cm-callout-${m[1].toLowerCase()}` }),
});
const decoPlugin = (decorator) =>
  ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = decorator.createDeco(view);
      }
      update(u) {
        this.decorations = decorator.updateDeco(u, this.decorations);
      }
    },
    { decorations: (v) => v.decorations },
  );

// Битые ссылки подчёркиваются волнистой линией.
const setProblems = StateEffect.define();
const problemField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setProblems)) continue;
      const len = tr.state.doc.length;
      deco = Decoration.set(
        e.value
          .filter((p) => p.to <= len && p.from < p.to)
          .map((p) => Decoration.mark({ class: 'cm-problem', attributes: { title: p.message } }).range(p.from, p.to)),
        true,
      );
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const PHRASES = {
  Find: 'Найти',
  Replace: 'Заменить',
  next: 'далее',
  previous: 'назад',
  all: 'все',
  'match case': 'регистр',
  regexp: 'рег. выражение',
  'by word': 'слово целиком',
  replace: 'заменить',
  'replace all': 'заменить все',
  close: 'закрыть',
  'current match': 'текущее совпадение',
  'replaced $ matches': 'заменено совпадений: $',
  'replaced match on line $': 'заменено в строке $',
  'on line': 'в строке',
  'Go to line': 'Перейти к строке',
  go: 'перейти',
  'Control character': 'Управляющий символ',
};

function createState(doc, cb) {
  // Подсказки адресов при наборе ссылки: [текст](#/…
  const linkCompletions = (ctx) => {
    const m = ctx.matchBefore(/\]\(#[^\s)]*/);
    if (!m) return null;
    return { from: m.from + 2, options: cb.current.completions?.() ?? [], validFor: /^#[^\s)]*$/ };
  };

  const uploadFiles = (view, files, pos) => {
    const images = [...files].filter((f) => f.type.startsWith('image/'));
    if (!images.length || !cb.current.onUpload) return false;
    (async () => {
      for (const f of images) {
        const url = await cb.current.onUpload(f);
        if (url) insertImage(view, url, '', '', Math.min(pos, view.state.doc.length));
      }
    })();
    return true;
  };

  // Сочетания с Ctrl узнаём по физической клавише: так они работают и в русской раскладке.
  const shortcuts = (view, e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
    const name = { KeyS: 'save', KeyK: e.shiftKey ? 'articleLink' : 'link' }[e.code];
    if (!name) return false;
    e.preventDefault();
    cb.current.onCommand?.(name);
    return true;
  };

  // Enter на пустой строке цитаты или плашки («>») завершает её.
  const endQuote = (view) => {
    const r = view.state.selection.main;
    const line = view.state.doc.lineAt(r.head);
    if (!r.empty || r.head !== line.to || !/^>\s?$/.test(line.text) || line.number === 1) return false;
    if (!/^>/.test(view.state.doc.line(line.number - 1).text)) return false;
    // Пустая строка между цитатой и текстом обязательна, иначе Markdown приклеит текст к цитате.
    view.dispatch({ changes: { from: line.from, to: line.to, insert: '\n' }, selection: { anchor: line.from + 1 }, userEvent: 'input' });
    return true;
  };

  return EditorState.create({
    doc,
    extensions: [
      history(),
      drawSelection(),
      dropCursor(),
      highlightSpecialChars(),
      EditorState.allowMultipleSelections.of(true),
      rectangularSelection(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(highlight),
      EditorView.lineWrapping,
      placeholder('Начните писать… Разделы статьи — «## Заголовок», подсказки по разметке — кнопка «?»'),
      search({ top: true }),
      autocompletion({ override: [linkCompletions], icons: false }),
      decoPlugin(mcDecorator),
      decoPlugin(calloutDecorator),
      problemField,
      EditorState.phrases.of(PHRASES),
      EditorView.contentAttributes.of({ spellcheck: 'true', lang: 'ru' }),
      Prec.highest(
        keymap.of([
          { any: shortcuts },
          { key: 'Enter', run: endQuote },
          { key: 'Mod-b', run: (v) => (toggleWrap(v, '**'), true) },
          { key: 'Mod-i', run: (v) => (toggleWrap(v, '*'), true) },
        ]),
      ),
      keymap.of([...completionKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
      EditorView.domEventHandlers({
        paste(e, view) {
          if (!uploadFiles(view, e.clipboardData?.files ?? [], view.state.selection.main.to)) return false;
          e.preventDefault();
          return true;
        },
        drop(e, view) {
          const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? view.state.selection.main.to;
          if (!uploadFiles(view, e.dataTransfer?.files ?? [], pos)) return false;
          e.preventDefault();
          return true;
        },
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !u.transactions.some((tr) => tr.annotation(External))) {
          const text = u.state.doc.toString();
          cb.current.last = text;
          cb.current.onChange?.(text);
        }
        if (u.docChanged || u.selectionSet) cb.current.onCursor?.(u.state);
      }),
    ],
  });
}

/**
 * Редактор markdown на CodeMirror. Управляется снаружи через value/onChange,
 * а ref даёт доступ к самому редактору для команд панели инструментов.
 */
export default function MarkdownEditor({ ref, docKey, value, problems, ...handlers }) {
  const host = useRef(null);
  const viewRef = useRef(null);
  const keyRef = useRef(docKey);
  const cb = useRef({});
  Object.assign(cb.current, handlers);

  useImperativeHandle(ref, () => ({ view: () => viewRef.current }), []);

  useEffect(() => {
    const s = saved.get(docKey);
    const view = new EditorView({
      parent: host.current,
      state: s && s.state.doc.toString() === value ? s.state : createState(value, cb),
    });
    viewRef.current = view;
    cb.current.last = value;
    if (s) requestAnimationFrame(() => (view.scrollDOM.scrollTop = s.scroll));
    const onScroll = () => cb.current.onScroll?.(view);
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
    cb.current.onCursor?.(view.state);
    return () => {
      saved.set(keyRef.current, { state: view.state, scroll: view.scrollDOM.scrollTop });
      view.destroy();
      viewRef.current = null;
    };
    // Редактор создаётся один раз; смена статьи обрабатывается ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Другая статья: запоминаем состояние прежней и подставляем состояние новой.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || keyRef.current === docKey) return;
    saved.set(keyRef.current, { state: view.state, scroll: view.scrollDOM.scrollTop });
    keyRef.current = docKey;
    const s = saved.get(docKey);
    view.setState(s && s.state.doc.toString() === value ? s.state : createState(value, cb));
    cb.current.last = value;
    requestAnimationFrame(() => (view.scrollDOM.scrollTop = s?.scroll ?? 0));
    cb.current.onCursor?.(view.state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  // Текст поменялся не из редактора (перечитан с диска, восстановлена версия) — подставляем его.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === cb.current.last || keyRef.current !== docKey) return;
    cb.current.last = value;
    if (view.state.doc.toString() === value) return;
    const head = Math.min(view.state.selection.main.head, value.length);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: { anchor: head },
      annotations: External.of(true),
    });
  }, [value, docKey]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setProblems.of(problems ?? []) });
  }, [problems]);

  return <div className="cm-host" ref={host} />;
}
