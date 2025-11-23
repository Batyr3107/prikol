require('dotenv').config();

// Валидация environment переменных перед запуском
const { validateEnv, printConfig } = require('./validateEnv');
validateEnv();

const express = require('express');
const cors = require('cors');
const path = require('path');
const prisma = require('./db');
const { sanitizeText, validateRule, validateVote, validateUserId, calculateRating } = require('./utils');
const rateLimiter = require('./middleware/rateLimiter');
const logger = require('./middleware/logger');
const { HTTP, PAGINATION } = require('./constants');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // В development разрешаем все origins
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // В production проверяем allowed origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : [];

    // Разрешаем запросы без origin (мобильные приложения, Postman и т.д.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS: Blocked origin ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // 24 часа кэширования preflight
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: HTTP.REQUEST_SIZE_LIMIT })); // Защита от слишком больших запросов (DoS)

// Security headers
app.use((req, res, next) => {
  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");
  // Предотвращает MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Защита от clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // XSS Protection (устаревший, но всё равно полезный)
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(logger.requestLogger());
app.use(express.static(path.join(__dirname, '../public')));

// Rate limiting для API
app.use('/api', rateLimiter.general);

// ============= API ENDPOINTS =============

// Получить все правила с рейтингом (с пагинацией и поиском)
app.get('/api/rules', async (req, res) => {
  try {
    const { page = PAGINATION.DEFAULT_PAGE, limit = PAGINATION.DEFAULT_LIMIT, search = '', sortBy = 'rating' } = req.query;
    const pageNum = Math.max(1, parseInt(page) || PAGINATION.DEFAULT_PAGE);
    const limitNum = Math.min(PAGINATION.MAX_LIMIT, Math.max(1, parseInt(limit) || PAGINATION.DEFAULT_LIMIT));
    const skip = (pageNum - 1) * limitNum;

    // Условие поиска (SQLite LIKE is case-insensitive by default)
    const searchCondition = search ? {
      OR: [
        { title: { contains: search } },
        { description: { contains: search } }
      ]
    } : {};

    // Получаем общее количество
    const total = await prisma.rule.count({ where: searchCondition });

    const rules = await prisma.rule.findMany({
      where: searchCondition,
      include: {
        author: {
          select: { displayName: true, username: true }
        },
        votes: {
          select: { value: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum
    });

    // Подсчитываем рейтинг для каждого правила
    const rulesWithRating = rules.map(rule => {
      const rating = calculateRating(rule.votes);
      const votesCount = rule.votes.length;
      return {
        id: rule.id,
        title: rule.title,
        description: rule.description,
        author: rule.author.displayName || rule.author.username || 'Аноним',
        createdAt: rule.createdAt,
        rating,
        votesCount
      };
    });

    // Сортируем по рейтингу если нужно
    if (sortBy === 'rating') {
      rulesWithRating.sort((a, b) => b.rating - a.rating);
    }

    res.json({
      rules: rulesWithRating,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error('Error fetching rules:', error);
    res.status(500).json({ error: 'Ошибка при получении правил' });
  }
});

// Получить топ правила (ПЕРЕД /:id чтобы не конфликтовать!)
app.get('/api/rules/top/:limit', async (req, res) => {
  try {
    const limit = Math.min(PAGINATION.MAX_LIMIT, Math.max(1, parseInt(req.params.limit) || 10));

    // Оптимизированный запрос с агрегацией на уровне БД
    const topRules = await prisma.$queryRaw`
      SELECT
        r.id,
        r.title,
        r.description,
        r.createdAt,
        u.displayName,
        u.username,
        COALESCE(SUM(v.value), 0) as rating,
        COUNT(v.id) as votesCount
      FROM Rule r
      LEFT JOIN User u ON r.authorId = u.id
      LEFT JOIN Vote v ON r.id = v.ruleId
      GROUP BY r.id
      ORDER BY rating DESC
      LIMIT ${limit}
    `;

    // Форматируем результат
    const formattedRules = topRules.map(rule => ({
      id: rule.id,
      title: rule.title,
      description: rule.description,
      author: rule.displayName || rule.username || 'Аноним',
      createdAt: new Date(rule.createdAt),
      rating: Number(rule.rating),
      votesCount: Number(rule.votesCount)
    }));

    res.json(formattedRules);
  } catch (error) {
    logger.error('Error fetching top rules:', error);
    res.status(500).json({ error: 'Ошибка при получении топ правил' });
  }
});

// Получить одно правило
app.get('/api/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Валидация ID
    const ruleId = parseInt(id);
    if (isNaN(ruleId)) {
      return res.status(400).json({ error: 'ID правила должен быть числом' });
    }

    const rule = await prisma.rule.findUnique({
      where: { id: ruleId },
      include: {
        author: {
          select: { displayName: true, username: true }
        },
        votes: {
          select: { value: true }
        }
      }
    });

    if (!rule) {
      return res.status(404).json({ error: 'Правило не найдено' });
    }

    const rating = calculateRating(rule.votes);

    res.json({
      id: rule.id,
      title: rule.title,
      description: rule.description,
      author: rule.author.displayName || rule.author.username || 'Аноним',
      createdAt: rule.createdAt,
      rating,
      votesCount: rule.votes.length
    });
  } catch (error) {
    logger.error('Error fetching rule:', error);
    res.status(500).json({ error: 'Ошибка при получении правила' });
  }
});

// Создать новое правило
app.post('/api/rules', rateLimiter.create, async (req, res) => {
  try {
    const { title, description, userId, userName } = req.body;

    // Валидация
    if (!validateUserId(userId)) {
      return res.status(400).json({ error: 'Необходимо указать корректный userId' });
    }

    const validation = validateRule(title, description);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.errors.join(', ') });
    }

    // Используем санитизированные данные
    const { title: safeTitle, description: safeDescription } = validation.sanitized;

    // Найти или создать пользователя
    let user = await prisma.user.findFirst({
      where: { id: parseInt(userId) }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: parseInt(userId),
          displayName: sanitizeText(userName) || 'Аноним'
        }
      });
    }

    const rule = await prisma.rule.create({
      data: {
        title: safeTitle,
        description: safeDescription || '',
        authorId: user.id
      },
      include: {
        author: {
          select: { displayName: true, username: true }
        }
      }
    });

    res.status(201).json({
      id: rule.id,
      title: rule.title,
      description: rule.description,
      author: rule.author.displayName || rule.author.username,
      createdAt: rule.createdAt,
      rating: 0,
      votesCount: 0
    });
  } catch (error) {
    logger.error('Error creating rule:', error);
    res.status(500).json({ error: 'Ошибка при создании правила' });
  }
});

// Проголосовать за правило
app.post('/api/rules/:id/vote', rateLimiter.vote, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, value, userName } = req.body;

    // Валидация ID правила
    const ruleId = parseInt(id);
    if (isNaN(ruleId)) {
      return res.status(400).json({ error: 'ID правила должен быть числом' });
    }

    // Валидация
    if (!validateUserId(userId)) {
      return res.status(400).json({ error: 'Необходимо указать корректный userId' });
    }

    if (!validateVote(value)) {
      return res.status(400).json({ error: 'Значение голоса должно быть 1 или -1' });
    }

    // Используем транзакцию для атомарности операции
    const result = await prisma.$transaction(async (tx) => {
      // Найти или создать пользователя
      let user = await tx.user.findFirst({
        where: { id: parseInt(userId) }
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            id: parseInt(userId),
            displayName: sanitizeText(userName) || 'Аноним'
          }
        });
      }

      // Проверяем, существует ли уже голос
      const existingVote = await tx.vote.findUnique({
        where: {
          ruleId_userId: {
            ruleId: ruleId,
            userId: user.id
          }
        }
      });

      let vote;
      if (existingVote) {
        // Обновляем существующий голос
        vote = await tx.vote.update({
          where: { id: existingVote.id },
          data: { value: parseInt(value) }
        });
      } else {
        // Создаем новый голос
        vote = await tx.vote.create({
          data: {
            ruleId: ruleId,
            userId: user.id,
            value: parseInt(value)
          }
        });
      }

      // Получаем обновленный рейтинг
      const votes = await tx.vote.findMany({
        where: { ruleId: ruleId }
      });
      const rating = votes.reduce((sum, v) => sum + v.value, 0);

      return {
        success: true,
        rating,
        votesCount: votes.length
      };
    });

    res.json(result);
  } catch (error) {
    logger.error('Error voting:', error);
    res.status(500).json({ error: 'Ошибка при голосовании' });
  }
});

// Статистика
app.get('/api/stats', async (req, res) => {
  try {
    // Оптимизированный запрос статистики с агрегацией в БД
    const [counts, votes, topRule] = await Promise.all([
      // Подсчет правил и пользователей
      prisma.$queryRaw`
        SELECT
          (SELECT COUNT(*) FROM Rule) as totalRules,
          (SELECT COUNT(*) FROM User) as totalUsers,
          (SELECT COUNT(*) FROM Vote) as totalVotes
      `,
      // Подсчет положительных/отрицательных голосов
      prisma.$queryRaw`
        SELECT
          SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END) as positiveVotes,
          SUM(CASE WHEN value = -1 THEN 1 ELSE 0 END) as negativeVotes
        FROM Vote
      `,
      // Топ правило
      prisma.$queryRaw`
        SELECT
          r.id,
          r.title,
          COALESCE(SUM(v.value), 0) as rating
        FROM Rule r
        LEFT JOIN Vote v ON r.id = v.ruleId
        GROUP BY r.id
        ORDER BY rating DESC
        LIMIT 1
      `
    ]);

    const stats = counts[0];
    const voteStats = votes[0];
    const top = topRule[0] || null;

    res.json({
      totalRules: Number(stats.totalRules),
      totalUsers: Number(stats.totalUsers),
      totalVotes: Number(stats.totalVotes),
      positiveVotes: Number(voteStats.positiveVotes || 0),
      negativeVotes: Number(voteStats.negativeVotes || 0),
      topRule: top ? {
        id: top.id,
        title: top.title,
        rating: Number(top.rating)
      } : null,
      avgVotesPerRule: stats.totalRules > 0
        ? (Number(stats.totalVotes) / Number(stats.totalRules)).toFixed(2)
        : '0.00'
    });
  } catch (error) {
    logger.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Ошибка при получении статистики' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} не найден`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);

  // Не показываем детали ошибки в production
  const isDev = process.env.NODE_ENV === 'development';

  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: isDev ? err.message : 'Произошла ошибка на сервере',
    ...(isDev && { stack: err.stack })
  });
});

// Запуск сервера
const server = app.listen(PORT, () => {
  logger.success(`🚀 Сервер запущен на http://localhost:${PORT}`);
  logger.info(`📊 API доступен на http://localhost:${PORT}/api`);
  printConfig();
});

// Graceful shutdown функция
async function gracefulShutdown(exitCode = 0) {
  logger.info('Начинаем graceful shutdown...');

  // Останавливаем прием новых запросов
  server.close(() => {
    logger.info('HTTP сервер закрыт');
  });

  // Очищаем rate limiter intervals
  rateLimiter.cleanup();

  // Закрываем соединение с БД
  try {
    await prisma.$disconnect();
    logger.success('Соединение с БД закрыто');
  } catch (error) {
    logger.error('Ошибка при закрытии БД:', error);
  }

  logger.success('Shutdown завершен');
  process.exit(exitCode);
}

// Обработчики ошибок процесса
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise);
  logger.error('Reason:', reason);
  // В production желательно отправлять в систему мониторинга (Sentry, DataDog)
  gracefulShutdown(1);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // В production желательно отправлять в систему мониторинга
  gracefulShutdown(1);
});

// Graceful shutdown при SIGINT и SIGTERM
process.on('SIGINT', () => {
  logger.info('Получен сигнал SIGINT');
  gracefulShutdown(0);
});

process.on('SIGTERM', () => {
  logger.info('Получен сигнал SIGTERM');
  gracefulShutdown(0);
});
