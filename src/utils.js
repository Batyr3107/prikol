// Утилиты для приложения
const { VALIDATION } = require('./constants');

/**
 * Санитизация текста - удаляет опасные символы
 */
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';

  // Удаляем null bytes и другие опасные символы
  return text
    .replace(/\0/g, '') // Null bytes
    .replace(/[\x00-\x1F\x7F]/g, '') // Control characters
    .normalize('NFKC') // Нормализация unicode
    .replace(/\s+/g, ' ') // Множественные пробелы -> один
    .trim()
    .slice(0, 10000); // Защита от слишком длинных строк
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
  } else if (cleanTitle.length < VALIDATION.TITLE_MIN_LENGTH) {
    errors.push(`Название правила должно быть не менее ${VALIDATION.TITLE_MIN_LENGTH} символов`);
  } else if (cleanTitle.length > VALIDATION.TITLE_MAX_LENGTH) {
    errors.push(`Название правила не должно превышать ${VALIDATION.TITLE_MAX_LENGTH} символов`);
  }

  if (cleanDescription && cleanDescription.length > VALIDATION.DESCRIPTION_MAX_LENGTH) {
    errors.push(`Описание не должно превышать ${VALIDATION.DESCRIPTION_MAX_LENGTH} символов`);
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
 * Проверяет что userId - корректное целое положительное число в безопасном диапазоне
 */
function validateUserId(userId) {
  if (!userId) return false;

  const id = parseInt(userId);

  // Проверки:
  // 1. Должно быть числом
  // 2. Должно быть положительным
  // 3. Должно быть в безопасном диапазоне (MAX_SAFE_INTEGER)
  // 4. Должно быть конечным (не Infinity)
  return !isNaN(id) &&
         id > 0 &&
         id <= Number.MAX_SAFE_INTEGER &&
         Number.isFinite(id);
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
 * Вычисление рейтинга из массива голосов
 */
function calculateRating(votes) {
  if (!votes || !Array.isArray(votes)) return 0;
  return votes.reduce((sum, vote) => sum + vote.value, 0);
}

/**
 * Экранирование HTML для защиты от XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Подсчет голосов определенного типа
 */
function countVotes(votes, value) {
  if (!votes || !Array.isArray(votes)) return 0;
  return votes.filter(v => v.value === value).length;
}

module.exports = {
  sanitizeText,
  validateRule,
  validateVote,
  validateUserId,
  formatDate,
  getRatingEmoji,
  calculateRating,
  escapeHtml,
  countVotes
};
