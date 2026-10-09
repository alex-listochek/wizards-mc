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

export const diffStats = (lines) => ({
  added: lines.filter((l) => l.type === 'add').length,
  removed: lines.filter((l) => l.type === 'del').length,
});
