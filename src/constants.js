// Константы приложения

module.exports = {
  // Валидация
  VALIDATION: {
    TITLE_MIN_LENGTH: 3,
    TITLE_MAX_LENGTH: 200,
    DESCRIPTION_MAX_LENGTH: 1000,
    USERNAME_MIN_LENGTH: 2,
    USERNAME_MAX_LENGTH: 100
  },

  // Rate limiting
  RATE_LIMITS: {
    GENERAL_MAX: 100,           // Максимум общих запросов
    GENERAL_WINDOW: 60000,      // Окно в миллисекундах (1 минута)
    CREATE_MAX: 10,             // Максимум создания правил
    CREATE_WINDOW: 60000,       // Окно для создания
    VOTE_MAX: 50,               // Максимум голосований
    VOTE_WINDOW: 60000,         // Окно для голосования
    BOT_ACTION_DELAY: 1000      // Задержка между действиями бота (1 сек)
  },

  // Пагинация
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 50,
    MAX_LIMIT: 100
  },

  // Очистка и таймауты
  CLEANUP: {
    RATE_LIMITER_INTERVAL: 5 * 60 * 1000,  // 5 минут
    USER_STATE_TTL: 10 * 60 * 1000          // 10 минут для состояния бота
  },

  // HTTP
  HTTP: {
    REQUEST_SIZE_LIMIT: '1mb'
  }
};
