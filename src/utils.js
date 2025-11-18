// Утилиты для приложения

/**
 * Валидация правила
 */
function validateRule(title, description) {
  const errors = [];

  if (!title || typeof title !== 'string') {
    errors.push('Название правила обязательно');
  } else if (title.trim().length < 3) {
    errors.push('Название правила должно быть не менее 3 символов');
  } else if (title.length > 200) {
    errors.push('Название правила не должно превышать 200 символов');
  }

  if (description && typeof description === 'string' && description.length > 1000) {
    errors.push('Описание не должно превышать 1000 символов');
  }

  return {
    isValid: errors.length === 0,
    errors
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
 */
function handleError(error, context = 'Operation') {
  console.error(`[${context}] Error:`, error);
  return {
    error: 'Произошла ошибка',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  };
}

module.exports = {
  validateRule,
  validateVote,
  validateUserId,
  formatDate,
  getRatingEmoji,
  handleError
};
