require('dotenv').config();

// Валидация environment переменных
const { validateEnv, validateTelegramToken } = require('./validateEnv');
validateEnv();

const TelegramBot = require('node-telegram-bot-api');
const prisma = require('./db');
const { disconnect: dbDisconnect } = require('./db');
const { sanitizeText, validateRule, calculateRating, escapeHtml, countVotes } = require('./utils');
const { VALIDATION } = require('./constants');
const logger = require('./middleware/logger');

const token = process.env.TELEGRAM_BOT_TOKEN;
validateTelegramToken(token);

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

    bot.sendMessage(
      chatId,
      `📋 Последние ${rules.length} правил:\n\n(Нажмите на правило для голосования)`
    );

    for (const rule of rules) {
      const rating = calculateRating(rule.votes);
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
    const rulesWithRating = rules.map((rule) => ({
      ...rule,
      rating: calculateRating(rule.votes)
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
      if (text.length > VALIDATION.TITLE_MAX_LENGTH) {
        bot.sendMessage(
          chatId,
          `❌ Название слишком длинное (максимум ${VALIDATION.TITLE_MAX_LENGTH} символов). Попробуйте снова с /new`
        );
        delete userState[userId];
        return;
      }
      state.title = text;
      state.step = 'waiting_description';
      bot.sendMessage(
        chatId,
        '✍️ Отлично! Теперь введите описание правила (или /skip чтобы пропустить):'
      );
    } else if (state.step === 'waiting_description') {
      // Сохраняем описание
      const description = text === '/skip' ? '' : text;

      // Валидация правила
      const validation = validateRule(state.title, description);
      if (!validation.isValid) {
        bot.sendMessage(
          chatId,
          `❌ Ошибка: ${validation.errors.join(', ')}\n\nПопробуйте снова с /new`
        );
        delete userState[userId];
        return;
      }

      // Находим пользователя
      const user = await prisma.user.findUnique({
        where: { telegramId: userId.toString() }
      });

      if (!user) {
        bot.sendMessage(
          chatId,
          '❌ Ошибка: пользователь не найден. Отправьте /start для регистрации.'
        );
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
  const _chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  try {
    // Формат: vote_ruleId_value
    const [action, ruleId, value] = data.split('_');

    if (action === 'vote') {
      // Используем транзакцию для атомарности
      const { rating, rule } = await prisma.$transaction(async (tx) => {
        // Находим пользователя
        const user = await tx.user.findUnique({
          where: { telegramId: userId.toString() }
        });

        if (!user) {
          throw new Error('USER_NOT_FOUND');
        }

        const voteValue = parseInt(value);

        // Проверяем существующий голос
        const existingVote = await tx.vote.findUnique({
          where: {
            ruleId_userId: {
              ruleId: parseInt(ruleId),
              userId: user.id
            }
          }
        });

        if (existingVote) {
          // Обновляем голос
          await tx.vote.update({
            where: { id: existingVote.id },
            data: { value: voteValue }
          });
        } else {
          // Создаем новый голос
          await tx.vote.create({
            data: {
              ruleId: parseInt(ruleId),
              userId: user.id,
              value: voteValue
            }
          });
        }

        // Получаем обновленный рейтинг
        const votes = await tx.vote.findMany({
          where: { ruleId: parseInt(ruleId) }
        });
        const rating = calculateRating(votes);

        // Получаем правило для обновления сообщения
        const rule = await tx.rule.findUnique({
          where: { id: parseInt(ruleId) },
          include: { author: true, votes: true }
        });

        return { rating, rule, voteValue };
      });

      // Обновляем сообщение
      await updateRuleMessage(query.message, rule, rating);

      const emoji = value === '1' ? '👍' : '👎';
      bot.answerCallbackQuery(query.id, { text: `${emoji} Ваш голос учтен!` });
    }
  } catch (error) {
    if (error.message === 'USER_NOT_FOUND') {
      bot.answerCallbackQuery(query.id, { text: '❌ Пользователь не найден. Отправьте /start' });
    } else {
      logger.error('Error processing vote:', error);
      bot.answerCallbackQuery(query.id, { text: '❌ Ошибка при голосовании' });
    }
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

// Функции countVotes и escapeHtml импортированы из utils.js

// Graceful shutdown функция
async function gracefulShutdown(exitCode = 0) {
  logger.info('\n🛑 Остановка бота...');

  try {
    await bot.stopPolling();
    logger.info('Polling остановлен');
  } catch (error) {
    logger.error('Ошибка остановки polling:', error);
  }

  try {
    await dbDisconnect();
    logger.success('Соединение с БД закрыто');
  } catch (error) {
    logger.error('Ошибка закрытия БД:', error);
  }

  logger.success('Бот остановлен');
  process.exit(exitCode);
}

// Обработчики ошибок процесса
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise);
  logger.error('Reason:', reason);
  gracefulShutdown(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Получен сигнал SIGINT');
  gracefulShutdown(0);
});

process.on('SIGTERM', () => {
  logger.info('Получен сигнал SIGTERM');
  gracefulShutdown(0);
});
