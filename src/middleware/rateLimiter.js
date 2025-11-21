// Простой rate limiter без внешних зависимостей
const logger = require('./logger');

class RateLimiter {
  constructor(windowMs = 60000, max = 100) {
    this.windowMs = windowMs; // Временное окно в миллисекундах
    this.max = max; // Максимум запросов в окне
    this.clients = new Map();

    // Автоматическая очистка каждые 5 минут
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  // Очистка старых записей
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, data] of this.clients.entries()) {
      if (now - data.resetTime > this.windowMs) {
        this.clients.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0 && process.env.NODE_ENV === 'development') {
      logger.info(`[RateLimiter] Cleaned ${cleaned} expired entries`);
    }
  }

  // Уничтожение rate limiter и очистка interval
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('[RateLimiter] Cleanup interval cleared');
    }
  }

  middleware() {
    return (req, res, next) => {
      // Получаем IP клиента
      const key = req.ip || req.connection.remoteAddress || 'unknown';
      const now = Date.now();

      let clientData = this.clients.get(key);

      if (!clientData || now - clientData.resetTime > this.windowMs) {
        // Новое окно или первый запрос
        clientData = {
          count: 1,
          resetTime: now
        };
        this.clients.set(key, clientData);
        return next();
      }

      clientData.count++;

      if (clientData.count > this.max) {
        // Превышен лимит
        const retryAfter = Math.ceil((this.windowMs - (now - clientData.resetTime)) / 1000);
        res.set('Retry-After', retryAfter);
        return res.status(429).json({
          error: 'Слишком много запросов. Попробуйте позже.',
          retryAfter
        });
      }

      // Добавляем заголовки о лимитах
      res.set('X-RateLimit-Limit', this.max);
      res.set('X-RateLimit-Remaining', Math.max(0, this.max - clientData.count));
      res.set('X-RateLimit-Reset', new Date(clientData.resetTime + this.windowMs).toISOString());

      next();
    };
  }
}

// Создаем лимитеры для разных типов запросов
const generalLimiter = new RateLimiter(60000, 100); // 100 запросов в минуту
const createLimiter = new RateLimiter(60000, 10); // 10 создании правил в минуту
const voteLimiter = new RateLimiter(60000, 50); // 50 голосов в минуту

module.exports = {
  general: generalLimiter.middleware(),
  create: createLimiter.middleware(),
  vote: voteLimiter.middleware(),
  // Функция для graceful shutdown
  cleanup: () => {
    generalLimiter.destroy();
    createLimiter.destroy();
    voteLimiter.destroy();
  }
};
