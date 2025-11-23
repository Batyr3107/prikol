// Winston logger - производственный logger с ротацией файлов
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

// Кастомные цвета для консоли
const customColors = {
  error: 'red',
  warn: 'yellow',
  info: 'blue',
  http: 'magenta',
  debug: 'cyan',
  success: 'green'
};

winston.addColors(customColors);

// Формат для консоли (цветной)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...rest } = info;
    let log = `${timestamp} [${level}]: ${message}`;

    // Добавляем дополнительные поля если есть
    if (Object.keys(rest).length > 0) {
      log += ` ${JSON.stringify(rest, null, 2)}`;
    }

    return log;
  })
);

// Формат для файлов (JSON)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Transports
const transports = [
  // Console (всегда включен)
  new winston.transports.Console({
    format: consoleFormat
  })
];

// Файловое логирование только в production или если явно указано
if (process.env.NODE_ENV === 'production' || process.env.LOG_TO_FILE === 'true') {
  // Все логи (info и выше)
  transports.push(
    new DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      level: 'info',
      format: fileFormat
    })
  );

  // Только ошибки
  transports.push(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
      format: fileFormat
    })
  );

  // HTTP логи (для production мониторинга)
  transports.push(
    new DailyRotateFile({
      filename: 'logs/http-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '7d',
      level: 'http',
      format: fileFormat
    })
  );
}

// Создаем logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    success: 4,
    debug: 5
  },
  transports,
  // Обработка неперехваченных исключений
  exceptionHandlers: process.env.NODE_ENV === 'production' ? [
    new DailyRotateFile({
      filename: 'logs/exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat
    })
  ] : [],
  // Обработка неперехваченных промисов
  rejectionHandlers: process.env.NODE_ENV === 'production' ? [
    new DailyRotateFile({
      filename: 'logs/rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat
    })
  ] : []
});

// Middleware для логирования HTTP запросов
logger.requestLogger = () => {
  return (req, res, next) => {
    const start = Date.now();
    const { method, url, ip } = req;

    // Логируем после завершения запроса
    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;
      const level = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'http';

      logger.log(level, `${method} ${url} ${statusCode} - ${duration}ms - ${ip}`);
    });

    next();
  };
};

// Добавляем кастомный метод success
logger.success = (message, meta) => {
  logger.log('success', message, meta);
};

// Экспортируем logger
module.exports = logger;
