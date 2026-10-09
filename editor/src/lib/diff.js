// Построчное сравнение двух версий текста (для истории и «Что изменилось»).

export function diffLines(oldText, newText) {
  const a = oldText.replace(/\r\n/g, '\n').split('\n');
  const b = newText.replace(/\r\n/g, '\n').split('\n');

  // Одинаковые начало и конец не сравниваем — так быстрее.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  const mid = [];

  if (n * m > 5_000_000) {
    for (const l of midA) mid.push({ type: 'del', text: l });
    for (const l of midB) mid.push({ type: 'add', text: l });
  } else {
    // Наибольшая общая подпоследовательность строк.
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = midA[i] === midB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        mid.push({ type: 'same', text: midA[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) mid.push({ type: 'del', text: midA[i++] });
      else mid.push({ type: 'add', text: midB[j++] });
    }
    while (i < n) mid.push({ type: 'del', text: midA[i++] });
    while (j < m) mid.push({ type: 'add', text: midB[j++] });
  }

  const lines = [
    ...a.slice(0, start).map((text) => ({ type: 'same', text })),
    ...mid,
    ...a.slice(endA).map((text) => ({ type: 'same', text })),
  ];

  // Номера строк в старой и новой версии.
  let oldNo = 0;
  let newNo = 0;
  for (const l of lines) {
    if (l.type !== 'add') l.oldNo = ++oldNo;
    if (l.type !== 'del') l.newNo = ++newNo;
  }
  return lines;
}

/** Группы изменённых строк с несколькими строками вокруг; длинные одинаковые куски сворачиваются. */
export function hunks(lines, context = 3) {
  const changed = lines.map((l) => l.type !== 'same');
  const keep = lines.map((_, i) => changed.slice(Math.max(0, i - context), i + context + 1).some(Boolean));
  const out = [];
  let skipped = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped) out.push({ type: 'skip', count: skipped });
      skipped = 0;
      out.push(l);
    } else skipped++;
  });
  if (skipped) out.push({ type: 'skip', count: skipped });
  return out;
}

/** Номер изменения (подряд идущие изменённые строки) для каждой строки сравнения, у неизменённых — -1. */
export function changeBlocks(lines) {
  let block = -1;
  return lines.map((l, i) => {
    if (l.type === 'same') return -1;
    if (i === 0 || lines[i - 1].type === 'same') block++;
    return block;
  });
}

/** Текст, в котором одно изменение возвращено как было, а остальные правки остались. */
export function revertBlock(lines, block) {
  const blocks = changeBlocks(lines);
  return lines
    .filter((l, i) => l.type === 'same' || (blocks[i] === block ? l.type === 'del' : l.type === 'add'))
    .map((l) => l.text)
    .join('\n');
}

/**
 * Пометки для редактора: какие строки нового текста изменены или добавлены (changed)
 * и перед какими строками что-то удалили (deleted). Номера строк — с единицы.
 */
export function lineMarks(oldText, newText) {
  const lines = diffLines(oldText, newText);
  const blocks = changeBlocks(lines);
  const total = lines.filter((l) => l.type !== 'del').length;
  const marks = [];
  let newNo = 0;
  lines.forEach((l, i) => {
    if (l.type !== 'del') newNo++;
    if (l.type === 'add') marks.push({ line: newNo, type: 'changed' });
    // Изменение из одних удалений: отмечаем строку, на месте которой был удалённый текст.
    else if (l.type === 'del' && blocks[i] !== blocks[i + 1] && total) {
      const pureDeletion = lines.every((x, j) => blocks[j] !== blocks[i] || x.type === 'del');
      if (pureDeletion) marks.push({ line: Math.min(newNo + 1, total), type: 'deleted' });
    }
  });
  return marks;
}

export const diffStats = (lines) => ({
  added: lines.filter((l) => l.type === 'add').length,
  removed: lines.filter((l) => l.type === 'del').length,
});
