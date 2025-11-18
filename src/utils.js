// Утилиты для приложения

/**
 * Санитизация текста - удаляет опасные символы
 */
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';

  // Удаляем null bytes и другие опасные символы
  return text
    .replace(/\0/g, '') // Null bytes
    .replace(/[\x00-\x1F\x7F]/g, '') // Control characters
    .trim();
}

/**
 * Валидация правила
 */
function validateRule(title, description) {
  const errors = [];

  // Санитизируем входные данные
  const cleanTitle = sanitizeText(title);
  const cleanDescription = sanitizeText(description);

  if (!cleanTitle) {
    errors.push('Название правила обязательно');
  } else if (cleanTitle.length < 3) {
    errors.push('Название правила должно быть не менее 3 символов');
  } else if (cleanTitle.length > 200) {
    errors.push('Название правила не должно превышать 200 символов');
  }

  if (cleanDescription && cleanDescription.length > 1000) {
    errors.push('Описание не должно превышать 1000 символов');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: {
      title: cleanTitle,
      description: cleanDescription
    }
  };
}

/**
 * Валидация голоса
 */
function validateVote(value) {
  const numValue = parseInt(value);
  return numValue === 1 || numValue === -1;
}

/**
 * Валидация userId
 */
function validateUserId(userId) {
  return userId && (typeof userId === 'string' || typeof userId === 'number');
}

/**
 * Форматирование даты
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Получение рейтинга с эмодзи
 */
function getRatingEmoji(rating) {
  if (rating > 0) return '🔥';
  if (rating < 0) return '❄️';
  return '⚖️';
}

/**
 * Безопасная обработка ошибки
 * Примечание: Эта функция не экспортирована и не используется в текущем коде
 * Оставлена для будущего использования
 */
function handleError(error, context = 'Operation') {
  // В будущем можно добавить import logger и использовать его
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${context}] Error:`, error);
  }
  return {
    error: 'Произошла ошибка',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  };
}

module.exports = {
  sanitizeText,
  validateRule,
  validateVote,
  validateUserId,
  formatDate,
  getRatingEmoji,
  handleError
};
