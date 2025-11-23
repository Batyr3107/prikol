// Простой rate limiter без внешних зависимостей
const logger = require('./logger');
const { RATE_LIMITS, CLEANUP } = require('../constants');

/**
 * Получить IP клиента с учетом proxy
 * ВНИМАНИЕ: Использовать только за доверенным reverse proxy (nginx, traefik)
 */
function getClientIp(req) {
  // Если приложение за proxy, доверяем заголовкам
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      // Берем первый IP (клиента), остальные - промежуточные proxy
      return forwarded.split(',')[0].trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) return realIp.trim();
  }

  // Fallback на стандартные методы
  return req.ip ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

class RateLimiter {
  constructor(windowMs = RATE_LIMITS.GENERAL_WINDOW, max = RATE_LIMITS.GENERAL_MAX) {
    this.windowMs = windowMs; // Временное окно в миллисекундах
    this.max = max; // Максимум запросов в окне
    this.clients = new Map();

    // Автоматическая очистка
    this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP.RATE_LIMITER_INTERVAL);
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
      // Получаем IP клиента с учетом proxy
      const key = getClientIp(req);
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
const generalLimiter = new RateLimiter(RATE_LIMITS.GENERAL_WINDOW, RATE_LIMITS.GENERAL_MAX);
const createLimiter = new RateLimiter(RATE_LIMITS.CREATE_WINDOW, RATE_LIMITS.CREATE_MAX);
const voteLimiter = new RateLimiter(RATE_LIMITS.VOTE_WINDOW, RATE_LIMITS.VOTE_MAX);

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
