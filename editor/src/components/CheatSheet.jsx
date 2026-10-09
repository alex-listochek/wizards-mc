import { CALLOUTS, MC_COLORS } from '../lib/mc.js';
import { Modal } from './Modal.jsx';

const SYNTAX = [
  ['Раздел статьи', '## Заголовок', 'Попадает в оглавление справа и в поиск'],
  ['Подраздел', '### Подзаголовок', 'Тоже в оглавлении, с отступом'],
  ['Жирный, курсив, зачёркнутый', '**жирный** *курсив* ~~текст~~', ''],
  ['Команда', '`/home`', 'Команды со «/» на сайте копируются по клику'],
  ['Блок кода', '```\n/register <пароль>\n```', 'С кнопкой «Копировать»'],
  ['Список', '- пункт\n- пункт', 'Нумерованный: 1. пункт'],
  ['Ссылка на сайт', '[Донат](https://wizards.easydonate.ru)', 'Открывается в новой вкладке'],
  ['Ссылка на статью', '[Устав](#/rules/charter)', 'Кнопка «Ссылка на статью» подставит адрес сама'],
  ['На заголовок статьи', '[Двери](#/world/movement#двери-шепота)', 'ё в адресе заголовка пишется как е'],
  ['На заголовок здесь же', '[ниже](#заголовок)', ''],
  ['Картинка', '![описание](images/pic.png "подпись")', 'Отдельным абзацем — с подписью и открывается по клику'],
  ['Таблица', '| Команда | Что делает |\n|---|---|\n| /home | Домой |', 'На телефоне — карточками, первая колонка заголовком'],
  ['Цвет Minecraft', '&bГолубой текст&r обычный', 'Цвет действует до следующего кода, &r или конца абзаца'],
  ['Цвет внутри жирного', '**&dФеникс**', 'Цвет заканчивается вместе с жирным'],
  ['Наказание в правилах', '<span class="penalty">пред + мут</span>', 'Красная метка'],
];

const KEYS = [
  ['Ctrl + S', 'Сохранить статью'],
  ['Ctrl + B / Ctrl + I', 'Жирный / курсив'],
  ['Ctrl + K', 'Ссылка'],
  ['Ctrl + Shift + K', 'Ссылка на статью'],
  ['Ctrl + F', 'Найти и заменить в статье'],
  ['Ctrl + P', 'Поиск по всем статьям'],
  ['Ctrl + Z / Ctrl + Y', 'Отменить / вернуть'],
  ['Ctrl + V картинки', 'Загрузить её на сайт и вставить'],
];

export default function CheatSheet({ onClose }) {
  return (
    <Modal title="Шпаргалка по разметке" onClose={onClose} width={820} className="cheat-modal">
      <table className="cheat">
        <tbody>
          {SYNTAX.map(([name, code, note]) => (
            <tr key={name}>
              <td className="cheat-name">{name}</td>
              <td>
                <pre>{code}</pre>
              </td>
              <td className="muted small">{note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Плашки</h3>
      <div className="cheat-row">
        {CALLOUTS.map((c) => (
          <code key={c.type} title={c.hint}>
            &gt; [!{c.type}] — {c.name}
          </code>
        ))}
      </div>
      <pre className="cheat-block">{'> [!WARNING]\n> Сменить расу можно, но это обнулит прогресс навыков.'}</pre>

      <h3>Цвета Minecraft</h3>
      <div className="cheat-colors">
        {MC_COLORS.map((c) => (
          <span key={c.code} className="cheat-color">
            <span className="swatch" style={{ background: c.hex }} />
            <code>&amp;{c.code}</code> {c.name}
          </span>
        ))}
        <span className="cheat-color">
          <code>&amp;r</code> сброс цвета
        </span>
      </div>

      <h3>Клавиши</h3>
      <div className="cheat-keys">
        {KEYS.map(([k, v]) => (
          <div key={k}>
            <kbd>{k}</kbd> <span>{v}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
