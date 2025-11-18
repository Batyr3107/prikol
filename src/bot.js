require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const prisma = require('./db');
const { sanitizeText, validateRule } = require('./utils');
const logger = require('./middleware/logger');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  logger.error('❌ TELEGRAM_BOT_TOKEN не установлен в .env файле');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Хранилище для процесса создания правила
const userState = {};

logger.success('🤖 Telegram бот запущен!');

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userName = sanitizeText(msg.from.first_name || msg.from.username);

  // Создаем или обновляем пользователя
  await prisma.user.upsert({
    where: { telegramId: userId.toString() },
    update: {
      username: sanitizeText(msg.from.username),
      displayName: userName
    },
    create: {
      telegramId: userId.toString(),
      username: sanitizeText(msg.from.username),
      displayName: userName
    }
  });

  const welcomeMessage = `
👋 Привет, ${userName}!

Добро пожаловать в систему создания мужских правил!

Здесь вы можете:
📝 Создавать правила
👍👎 Голосовать за правила
🏆 Смотреть топ универсальных правил

Команды:
/new - Создать новое правило
/list - Список всех правил
/top - Топ 10 правил
/help - Помощь
  `;

  bot.sendMessage(chatId, welcomeMessage);
});

// Команда /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
📖 Помощь

Доступные команды:

/new - Создать новое правило
/list - Показать все правила
/top - Топ 10 правил по рейтингу
/help - Эта справка

Как голосовать:
Когда вы видите правило, используйте кнопки:
👍 - согласен с правилом (+1)
👎 - не согласен с правилом (-1)

Рейтинг правила = сумма всех голосов
  `;

  bot.sendMessage(chatId, helpMessage);
});

// Команда /new - создать правило
bot.onText(/\/new/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  userState[userId] = { step: 'waiting_title' };

  bot.sendMessage(chatId, '📝 Отлично! Введите название правила:');
});

// Команда /list - список правил
bot.onText(/\/list/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const rules = await prisma.rule.findMany({
      include: {
        author: true,
        votes: true
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    if (rules.length === 0) {
      bot.sendMessage(chatId, '📭 Пока нет ни одного правила. Создайте первое с помощью /new');
      return;
    }

    bot.sendMessage(chatId, `📋 Последние ${rules.length} правил:\n\n(Нажмите на правило для голосования)`);

    for (const rule of rules) {
      const rating = rule.votes.reduce((sum, vote) => sum + vote.value, 0);
      await sendRuleMessage(chatId, rule, rating);
    }
  } catch (error) {
    logger.error('Error fetching rules:', error);
    bot.sendMessage(chatId, '❌ Ошибка при получении правил');
  }
});

// Команда /top - топ правил
bot.onText(/\/top/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const rules = await prisma.rule.findMany({
      include: {
        author: true,
        votes: true
      }
    });

    if (rules.length === 0) {
      bot.sendMessage(chatId, '📭 Пока нет ни одного правила. Создайте первое с помощью /new');
      return;
    }

    // Сортируем по рейтингу
    const rulesWithRating = rules.map(rule => ({
      ...rule,
      rating: rule.votes.reduce((sum, vote) => sum + vote.value, 0)
    }));

    rulesWithRating.sort((a, b) => b.rating - a.rating);
    const topRules = rulesWithRating.slice(0, 10);

    bot.sendMessage(chatId, '🏆 Топ 10 универсальных правил:\n');

    // Используем for...of вместо forEach для правильной обработки async
    for (let index = 0; index < topRules.length; index++) {
      await sendRuleMessage(chatId, topRules[index], topRules[index].rating, index + 1);
    }
  } catch (error) {
    logger.error('Error fetching top rules:', error);
    bot.sendMessage(chatId, '❌ Ошибка при получении топ правил');
  }
});

// Обработка текстовых сообщений (для создания правил)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  // Пропускаем команды
  if (!text || text.startsWith('/')) return;

  const state = userState[userId];
  if (!state) return;

  try {
    if (state.step === 'waiting_title') {
      // Сохраняем название с базовой валидацией
      if (text.length > 200) {
        bot.sendMessage(chatId, '❌ Название слишком длинное (максимум 200 символов). Попробуйте снова с /new');
        delete userState[userId];
        return;
      }
      state.title = text;
      state.step = 'waiting_description';
      bot.sendMessage(chatId, '✍️ Отлично! Теперь введите описание правила (или /skip чтобы пропустить):');
    } else if (state.step === 'waiting_description') {
      // Сохраняем описание
      const description = text === '/skip' ? '' : text;

      // Валидация правила
      const validation = validateRule(state.title, description);
      if (!validation.isValid) {
        bot.sendMessage(chatId, `❌ Ошибка: ${validation.errors.join(', ')}\n\nПопробуйте снова с /new`);
        delete userState[userId];
        return;
      }

      // Находим пользователя
      const user = await prisma.user.findUnique({
        where: { telegramId: userId.toString() }
      });

      if (!user) {
        bot.sendMessage(chatId, '❌ Ошибка: пользователь не найден. Отправьте /start для регистрации.');
        delete userState[userId];
        return;
      }

      // Создаем правило с санитизированными данными
      const rule = await prisma.rule.create({
        data: {
          title: validation.sanitized.title,
          description: validation.sanitized.description,
          authorId: user.id
        },
        include: {
          author: true
        }
      });

      delete userState[userId];

      bot.sendMessage(chatId, '✅ Правило успешно создано!');
      await sendRuleMessage(chatId, rule, 0);
    }
  } catch (error) {
    logger.error('Error creating rule:', error);
    bot.sendMessage(chatId, '❌ Ошибка при создании правила');
    delete userState[userId];
  }
});

// Обработка нажатий на кнопки
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  try {
    // Формат: vote_ruleId_value
    const [action, ruleId, value] = data.split('_');

    if (action === 'vote') {
      // Находим пользователя
      const user = await prisma.user.findUnique({
        where: { telegramId: userId.toString() }
      });

      if (!user) {
        bot.answerCallbackQuery(query.id, { text: '❌ Пользователь не найден' });
        return;
      }

      const voteValue = parseInt(value);

      // Проверяем существующий голос
      const existingVote = await prisma.vote.findUnique({
        where: {
          ruleId_userId: {
            ruleId: parseInt(ruleId),
            userId: user.id
          }
        }
      });

      if (existingVote) {
        // Обновляем голос
        await prisma.vote.update({
          where: { id: existingVote.id },
          data: { value: voteValue }
        });
      } else {
        // Создаем новый голос
        await prisma.vote.create({
          data: {
            ruleId: parseInt(ruleId),
            userId: user.id,
            value: voteValue
          }
        });
      }

      // Получаем обновленный рейтинг
      const votes = await prisma.vote.findMany({
        where: { ruleId: parseInt(ruleId) }
      });
      const rating = votes.reduce((sum, v) => sum + v.value, 0);

      // Обновляем сообщение
      const rule = await prisma.rule.findUnique({
        where: { id: parseInt(ruleId) },
        include: { author: true, votes: true }
      });

      await updateRuleMessage(query.message, rule, rating);

      const emoji = voteValue === 1 ? '👍' : '👎';
      bot.answerCallbackQuery(query.id, { text: `${emoji} Ваш голос учтен!` });
    }
  } catch (error) {
    logger.error('Error processing vote:', error);
    bot.answerCallbackQuery(query.id, { text: '❌ Ошибка при голосовании' });
  }
});

// Вспомогательная функция для отправки правила
async function sendRuleMessage(chatId, rule, rating, position = null) {
  const ratingEmoji = rating > 0 ? '🔥' : rating < 0 ? '❄️' : '⚖️';
  const positionText = position ? `${position}. ` : '';

  // Экранируем пользовательский контент
  const safeTitle = escapeHtml(rule.title);
  const safeDescription = escapeHtml(rule.description);
  const safeAuthor = escapeHtml(rule.author.displayName || rule.author.username || 'Аноним');

  const message = `
${positionText}${ratingEmoji} <b>${safeTitle}</b>

${rule.description ? safeDescription : '<i>Без описания</i>'}

👤 Автор: ${safeAuthor}
📊 Рейтинг: ${rating} (${rule.votes?.length || 0} голосов)
  `.trim();

  const keyboard = {
    inline_keyboard: [
      [
        { text: `👍 За (${countVotes(rule.votes, 1)})`, callback_data: `vote_${rule.id}_1` },
        { text: `👎 Против (${countVotes(rule.votes, -1)})`, callback_data: `vote_${rule.id}_-1` }
      ]
    ]
  };

  await bot.sendMessage(chatId, message, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

// Обновление сообщения с правилом
async function updateRuleMessage(message, rule, rating) {
  const ratingEmoji = rating > 0 ? '🔥' : rating < 0 ? '❄️' : '⚖️';

  // Экранируем пользовательский контент
  const safeTitle = escapeHtml(rule.title);
  const safeDescription = escapeHtml(rule.description);
  const safeAuthor = escapeHtml(rule.author.displayName || rule.author.username || 'Аноним');

  const newMessage = `
${ratingEmoji} <b>${safeTitle}</b>

${rule.description ? safeDescription : '<i>Без описания</i>'}

👤 Автор: ${safeAuthor}
📊 Рейтинг: ${rating} (${rule.votes.length} голосов)
  `.trim();

  const keyboard = {
    inline_keyboard: [
      [
        { text: `👍 За (${countVotes(rule.votes, 1)})`, callback_data: `vote_${rule.id}_1` },
        { text: `👎 Против (${countVotes(rule.votes, -1)})`, callback_data: `vote_${rule.id}_-1` }
      ]
    ]
  };

  await bot.editMessageText(newMessage, {
    chat_id: message.chat.id,
    message_id: message.message_id,
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

// Подсчет голосов
function countVotes(votes, value) {
  if (!votes) return 0;
  return votes.filter(v => v.value === value).length;
}

// Экранирование HTML для Telegram
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('\n🛑 Остановка бота...');
  await bot.stopPolling();
  await prisma.$disconnect();
  logger.success('Бот остановлен');
  process.exit(0);
});
