// Цвета Minecraft (&0–&f) и плашки, которые понимает сайт.

export const MC_COLORS = [
  { code: '0', name: 'Чёрный', hex: '#000000' },
  { code: '1', name: 'Тёмно-синий', hex: '#0000aa' },
  { code: '2', name: 'Тёмно-зелёный', hex: '#00aa00' },
  { code: '3', name: 'Бирюзовый', hex: '#00aaaa' },
  { code: '4', name: 'Тёмно-красный', hex: '#aa0000' },
  { code: '5', name: 'Фиолетовый', hex: '#aa00aa' },
  { code: '6', name: 'Золотой', hex: '#ffaa00' },
  { code: '7', name: 'Серый', hex: '#aaaaaa' },
  { code: '8', name: 'Тёмно-серый', hex: '#555555' },
  { code: '9', name: 'Синий', hex: '#5555ff' },
  { code: 'a', name: 'Зелёный', hex: '#55ff55' },
  { code: 'b', name: 'Голубой', hex: '#55ffff' },
  { code: 'c', name: 'Красный', hex: '#ff5555' },
  { code: 'd', name: 'Розовый', hex: '#ff55ff' },
  { code: 'e', name: 'Жёлтый', hex: '#ffff55' },
  { code: 'f', name: 'Белый', hex: '#ffffff' },
];

export const CALLOUTS = [
  { type: 'NOTE', name: 'Примечание', hint: 'Синяя плашка' },
  { type: 'TIP', name: 'Совет', hint: 'Фиолетовая плашка' },
  { type: 'WARNING', name: 'Внимание', hint: 'Жёлтая плашка' },
  { type: 'DANGER', name: 'Важно', hint: 'Красная плашка' },
];
