// Валидация environment переменных
const logger = require('./middleware/logger');

/**
 * Валидация обязательных environment переменных
 */
function validateEnv() {
  const errors = [];
  const warnings = [];

  // Обязательные переменные
  const required = {
    DATABASE_URL: process.env.DATABASE_URL,
  };

  // Опциональные но рекомендуемые
  const recommended = {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
  };

  // Проверка обязательных
  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      errors.push(`❌ Обязательная переменная ${key} не установлена`);
    }
  }

  // Проверка рекомендуемых
  for (const [key, value] of Object.entries(recommended)) {
    if (!value) {
      warnings.push(`⚠️  Рекомендуемая переменная ${key} не установлена (будет использовано значение по умолчанию)`);
    }
  }

  // Валидация значений
  if (process.env.NODE_ENV && !['development', 'production', 'test'].includes(process.env.NODE_ENV)) {
    errors.push(`❌ NODE_ENV должен быть: development, production или test (текущее: ${process.env.NODE_ENV})`);
  }

  if (process.env.PORT) {
    const port = parseInt(process.env.PORT);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push(`❌ PORT должен быть числом от 1 до 65535 (текущее: ${process.env.PORT})`);
    }
  }

  // Вывод результатов
  if (warnings.length > 0) {
    warnings.forEach(w => logger.warn(w));
  }

  if (errors.length > 0) {
    logger.error('❌ ОШИБКИ ВАЛИДАЦИИ ENVIRONMENT:');
    errors.forEach(e => logger.error(e));
    logger.error('\n💡 Создайте .env файл на основе .env.example');
    process.exit(1);
  }

  logger.success('✅ Environment переменные валидны');
}

/**
 * Валидация Telegram bot token
 */
function validateTelegramToken(token) {
  if (!token) {
    logger.error('❌ TELEGRAM_BOT_TOKEN не установлен в .env файле');
    logger.error('💡 Получите токен у @BotFather в Telegram');
    process.exit(1);
  }

  // Проверка формата токена (обычно формат: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz)
  const tokenPattern = /^\d+:[A-Za-z0-9_-]+$/;
  if (!tokenPattern.test(token)) {
    logger.warn('⚠️  TELEGRAM_BOT_TOKEN имеет нестандартный формат');
    logger.warn('   Обычный формат: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz');
  }

  logger.success('✅ Telegram bot token валиден');
}

/**
 * Вывод информации о конфигурации
 */
function printConfig() {
  logger.info('📋 Конфигурация приложения:');
  logger.info(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`   PORT: ${process.env.PORT || '3000'}`);
  logger.info(`   DATABASE: ${process.env.DATABASE_URL ? '✅ Настроена' : '❌ Не настроена'}`);
}

module.exports = {
  validateEnv,
  validateTelegramToken,
  printConfig
};
