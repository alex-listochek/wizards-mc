// Основные настройки базы знаний.

export const server = {
  name: 'Wizards ✨',
  tagline: 'Путеводитель по миру Wizards',
  // Текст под заголовком в превью ссылки (Telegram, VK, Discord).
  description: 'Правила, команды, расы, классы, крафты и чары сервера Wizards — всё в одном месте.',
  // Адрес сайта после публикации, например 'https://wiki.example.ru'.
  // Без него Telegram не покажет картинку в превью ссылки.
  siteUrl: 'https://alex-listochek.github.io/wizards-mc',
  // Данные для входа. Первый адрес показывается в шапке сайта.
  addresses: [
    { edition: 'Java', address: 'wizards.ru-mc.ru:25603', versions: '1.21.4 – 26.2' },
    { edition: 'Bedrock', address: 'wizards.ru-mc.ru', port: '18570', versions: '26.0 – 26.50' },
  ],
  // Статья, на которую ведёт ссылка «Не удаётся зайти?».
  helpArticle: '/start/geo',
  // Статья для новичков — ссылка на главной.
  startArticle: '/start/first-steps',
  links: [
    { label: 'Поддержка', url: 'https://t.me/wizticket_bot' },
    { label: 'Новости', url: 'https://t.me/wizards_mc' },
    { label: 'Беседа', url: 'https://t.me/+1oAPR-tY-dxkMTAy' },
    { label: 'Донат', url: 'https://wizards.easydonate.ru' },
    { label: 'Блог разработчика', url: 'https://telegram.me/wizards_dung' },
  ],
};

// Порядок, названия и иконки разделов. id — имя папки в src/content.
// Папки, которых здесь нет, тоже появятся в меню (в конце, под именем папки).
export const sections = [
  { id: 'start', title: 'Начало игры', icon: '🚀', description: 'Как зайти, где спавн и что такое Мёртвая зона' },
  { id: 'rules', title: 'Правила', icon: '📜', description: 'Устав мира Wizards и правила беседы' },
  { id: 'commands', title: 'Команды', icon: '⌨️', description: 'Все основные команды сервера' },
  { id: 'character', title: 'Персонаж', icon: '🧙', description: 'Расы, классы, навыки и скины' },
  { id: 'world', title: 'Мир', icon: '🌍', description: 'Перемещение, приваты, экономика и жители замка' },
  { id: 'clans', title: 'Кланы', icon: '⚔️', description: 'Уровни кланов, команды и советы главам' },
  { id: 'crafting', title: 'Крафт', icon: '⚒️', description: 'Кастомные крафты, рецепты и артефакты' },
  { id: 'enchants', title: 'Зачарования', icon: '✨', description: 'Более 150 кастомных чар и их снятие' },
  { id: 'donate', title: 'Донат', icon: '👑', description: 'Возможности Premium и рубины' },
];
