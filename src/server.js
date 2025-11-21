require('dotenv').config();

// Валидация environment переменных перед запуском
const { validateEnv, printConfig } = require('./validateEnv');
validateEnv();

const express = require('express');
const cors = require('cors');
const path = require('path');
const prisma = require('./db');
const { sanitizeText, validateRule, validateVote, validateUserId } = require('./utils');
const rateLimiter = require('./middleware/rateLimiter');
const logger = require('./middleware/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // В production рекомендуется ограничить: cors({ origin: ['https://yourdomain.com'] })
app.use(express.json({ limit: '1mb' })); // Защита от слишком больших запросов (DoS)

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
    const { page = 1, limit = 50, search = '', sortBy = 'rating' } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
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
      const rating = rule.votes.reduce((sum, vote) => sum + vote.value, 0);
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
    const limit = Math.min(100, Math.max(1, parseInt(req.params.limit) || 10));

    const rules = await prisma.rule.findMany({
      include: {
        author: {
          select: { displayName: true, username: true }
        },
        votes: {
          select: { value: true }
        }
      }
    });

    const rulesWithRating = rules.map(rule => {
      const rating = rule.votes.reduce((sum, vote) => sum + vote.value, 0);
      return {
        id: rule.id,
        title: rule.title,
        description: rule.description,
        author: rule.author.displayName || rule.author.username || 'Аноним',
        createdAt: rule.createdAt,
        rating,
        votesCount: rule.votes.length
      };
    });

    rulesWithRating.sort((a, b) => b.rating - a.rating);

    res.json(rulesWithRating.slice(0, limit));
  } catch (error) {
    logger.error('Error fetching top rules:', error);
    res.status(500).json({ error: 'Ошибка при получении топ правил' });
  }
});

// Получить одно правило
app.get('/api/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rule = await prisma.rule.findUnique({
      where: { id: parseInt(id) },
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

    const rating = rule.votes.reduce((sum, vote) => sum + vote.value, 0);

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
            ruleId: parseInt(id),
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
            ruleId: parseInt(id),
            userId: user.id,
            value: parseInt(value)
          }
        });
      }

      // Получаем обновленный рейтинг
      const votes = await tx.vote.findMany({
        where: { ruleId: parseInt(id) }
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
    const [
      totalRules,
      totalUsers,
      totalVotes,
      rulesWithVotes
    ] = await Promise.all([
      prisma.rule.count(),
      prisma.user.count(),
      prisma.vote.count(),
      prisma.rule.findMany({
        include: {
          votes: {
            select: { value: true }
          }
        }
      })
    ]);

    // Подсчитываем статистику голосов
    let positiveVotes = 0;
    let negativeVotes = 0;
    let topRating = 0;
    let topRule = null;

    rulesWithVotes.forEach(rule => {
      const rating = rule.votes.reduce((sum, vote) => sum + vote.value, 0);
      positiveVotes += rule.votes.filter(v => v.value === 1).length;
      negativeVotes += rule.votes.filter(v => v.value === -1).length;

      if (rating > topRating) {
        topRating = rating;
        topRule = {
          id: rule.id,
          title: rule.title,
          rating
        };
      }
    });

    res.json({
      totalRules,
      totalUsers,
      totalVotes,
      positiveVotes,
      negativeVotes,
      topRule,
      avgVotesPerRule: totalRules > 0 ? (totalVotes / totalRules).toFixed(2) : 0
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
app.listen(PORT, () => {
  logger.success(`🚀 Сервер запущен на http://localhost:${PORT}`);
  logger.info(`📊 API доступен на http://localhost:${PORT}/api`);
  printConfig();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Получен сигнал SIGINT, завершаем работу...');

  // Очищаем rate limiter intervals
  rateLimiter.cleanup();

  // Закрываем соединение с БД
  await prisma.$disconnect();
  logger.success('Соединение с БД закрыто');
  process.exit(0);
});
