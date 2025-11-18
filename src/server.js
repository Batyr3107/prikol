require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const prisma = require('./db');
const { validateRule, validateVote, validateUserId, handleError } = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ============= API ENDPOINTS =============

// Получить все правила с рейтингом
app.get('/api/rules', async (req, res) => {
  try {
    const rules = await prisma.rule.findMany({
      include: {
        author: {
          select: { displayName: true, username: true }
        },
        votes: {
          select: { value: true }
        }
      },
      orderBy: { createdAt: 'desc' }
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

    // Сортируем по рейтингу
    rulesWithRating.sort((a, b) => b.rating - a.rating);

    res.json(rulesWithRating);
  } catch (error) {
    console.error('Error fetching rules:', error);
    res.status(500).json({ error: 'Ошибка при получении правил' });
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
    console.error('Error fetching rule:', error);
    res.status(500).json({ error: 'Ошибка при получении правила' });
  }
});

// Создать новое правило
app.post('/api/rules', async (req, res) => {
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

    // Найти или создать пользователя
    let user = await prisma.user.findFirst({
      where: { id: parseInt(userId) }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: parseInt(userId),
          displayName: userName || 'Аноним'
        }
      });
    }

    const rule = await prisma.rule.create({
      data: {
        title,
        description: description || '',
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
    console.error('Error creating rule:', error);
    res.status(500).json({ error: 'Ошибка при создании правила' });
  }
});

// Проголосовать за правило
app.post('/api/rules/:id/vote', async (req, res) => {
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

    // Найти или создать пользователя
    let user = await prisma.user.findFirst({
      where: { id: parseInt(userId) }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: parseInt(userId),
          displayName: userName || 'Аноним'
        }
      });
    }

    // Проверяем, существует ли уже голос
    const existingVote = await prisma.vote.findUnique({
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
      vote = await prisma.vote.update({
        where: { id: existingVote.id },
        data: { value: parseInt(value) }
      });
    } else {
      // Создаем новый голос
      vote = await prisma.vote.create({
        data: {
          ruleId: parseInt(id),
          userId: user.id,
          value: parseInt(value)
        }
      });
    }

    // Получаем обновленный рейтинг
    const votes = await prisma.vote.findMany({
      where: { ruleId: parseInt(id) }
    });
    const rating = votes.reduce((sum, v) => sum + v.value, 0);

    res.json({
      success: true,
      rating,
      votesCount: votes.length
    });
  } catch (error) {
    console.error('Error voting:', error);
    res.status(500).json({ error: 'Ошибка при голосовании' });
  }
});

// Получить топ правила
app.get('/api/rules/top/:limit', async (req, res) => {
  try {
    const limit = parseInt(req.params.limit) || 10;

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
    console.error('Error fetching top rules:', error);
    res.status(500).json({ error: 'Ошибка при получении топ правил' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
  console.log(`📊 API доступен на http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
