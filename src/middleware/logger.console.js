// Простой logger для приложения

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class Logger {
  getTimestamp() {
    return new Date().toISOString();
  }

  info(message, ...args) {
    console.log(`${colors.blue}[INFO]${colors.reset} ${this.getTimestamp()} - ${message}`, ...args);
  }

  success(message, ...args) {
    console.log(
      `${colors.green}[SUCCESS]${colors.reset} ${this.getTimestamp()} - ${message}`,
      ...args
    );
  }

  warn(message, ...args) {
    console.warn(
      `${colors.yellow}[WARN]${colors.reset} ${this.getTimestamp()} - ${message}`,
      ...args
    );
  }

  error(message, error) {
    console.error(`${colors.red}[ERROR]${colors.reset} ${this.getTimestamp()} - ${message}`);
    if (error) {
      console.error(error);
    }
  }

  debug(message, ...args) {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `${colors.cyan}[DEBUG]${colors.reset} ${this.getTimestamp()} - ${message}`,
        ...args
      );
    }
  }

  // Middleware для логирования HTTP запросов
  requestLogger() {
    return (req, res, next) => {
      const start = Date.now();
      const { method, url, ip } = req;

      // Логируем после завершения запроса
      res.on('finish', () => {
        const duration = Date.now() - start;
        const { statusCode } = res;
        const color =
          statusCode >= 400 ? colors.red : statusCode >= 300 ? colors.yellow : colors.green;

        console.log(
          `${color}${method}${colors.reset} ${url} ${color}${statusCode}${colors.reset} - ${duration}ms - ${ip}`
        );
      });

      next();
    };
  }
}

module.exports = new Logger();
