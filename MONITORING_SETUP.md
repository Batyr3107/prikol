# Production Monitoring Setup

Руководство по настройке мониторинга и трекинга ошибок для production.

## Вариант 1: Sentry (Рекомендуется)

### Установка

```bash
npm install @sentry/node @sentry/profiling-node
```

### Настройка

Создайте файл `src/monitoring/sentry.js`:

```javascript
const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');

function initSentry() {
  if (process.env.SENTRY_DSN && process.env.NODE_ENV === 'production') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      integrations: [
        new ProfilingIntegration()
      ],
      // Производительность
      tracesSampleRate: 0.1, // 10% транзакций
      profilesSampleRate: 0.1, // 10% профилей

      // Фильтрация событий
      beforeSend(event, hint) {
        // Игнорируем 404 ошибки
        if (event.exception?.values?.[0]?.type === 'NotFoundError') {
          return null;
        }
        return event;
      },

      // Игнорируемые ошибки
      ignoreErrors: [
        'NetworkError',
        'AbortError',
        /cancelled/i
      ]
    });

    console.log('✅ Sentry инициализирован');
    return true;
  }
  return false;
}

module.exports = { initSentry, Sentry };
```

### Подключение к server.js

```javascript
// ===  В САМОМ НАЧАЛЕ server.js, ПЕРЕД ВСЕМИ require ===
require('dotenv').config();

// Инициализация Sentry должна быть первой!
const { initSentry, Sentry } = require('./monitoring/sentry');
const sentryEnabled = initSentry();

// ... остальные require ...

// === После создания app ===
const app = express();

// Sentry request handler (должен быть первым middleware)
if (sentryEnabled) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

// ... остальные middleware ...

// === ПЕРЕД error handler ===
// Sentry error handler (должен быть перед вашим error handler)
if (sentryEnabled) {
  app.use(Sentry.Handlers.errorHandler());
}

// Global error handler
app.use((err, req, res, next) => {
  // Ваш обработчик...
});
```

### Подключение к bot.js

```javascript
// В начале bot.js
const { initSentry, Sentry } = require('./monitoring/sentry');
const sentryEnabled = initSentry();

// В обработчиках ошибок
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);

  if (sentryEnabled) {
    Sentry.captureException(reason);
  }

  gracefulShutdown(1);
});

// При ловле ошибок
try {
  // ... код ...
} catch (error) {
  logger.error('Error:', error);

  if (sentryEnabled) {
    Sentry.captureException(error, {
      tags: {
        component: 'telegram-bot',
        action: 'create-rule'
      }
    });
  }
}
```

### .env настройка

```env
# Sentry
SENTRY_DSN=https://your-dsn@sentry.io/your-project-id
NODE_ENV=production
```

### Получение Sentry DSN

1. Зарегистрируйтесь на https://sentry.io
2. Создайте новый проект (Node.js)
3. Скопируйте DSN из настроек проекта
4. Добавьте в .env

### Преимущества Sentry:
- ✅ Real-time уведомления об ошибках
- ✅ Stack traces с source maps
- ✅ Breadcrumbs (что происходило до ошибки)
- ✅ Performance monitoring
- ✅ Release tracking
- ✅ User context
- ✅ Бесплатно до 5,000 событий/месяц

---

## Вариант 2: Datadog

### Установка

```bash
npm install dd-trace
```

### Настройка

```javascript
// В самом начале server.js
require('dd-trace').init({
  service: 'rules-voting-api',
  env: process.env.NODE_ENV,
  version: process.env.npm_package_version,
  logInjection: true
});
```

### .env

```env
DD_API_KEY=your-datadog-api-key
DD_SITE=datadoghq.com
```

---

## Вариант 3: New Relic

### Установка

```bash
npm install newrelic
```

### Настройка

Создайте `newrelic.js` в корне:

```javascript
exports.config = {
  app_name: ['Rules Voting API'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: 'info'
  }
};
```

### Использование

```javascript
// В начале server.js
require('newrelic');
```

---

## Вариант 4: Простой мониторинг (без сторонних сервисов)

### Health Check Endpoint (уже реализован)

```javascript
// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});
```

### Мониторинг через Uptime Robot / Better Uptime

1. Зарегистрируйтесь на https://uptimerobot.com (бесплатно)
2. Добавьте monitor для `https://yourdomain.com/api/health`
3. Настройте email уведомления

### Custom metrics в Winston

```javascript
// Подсчет ошибок
let errorCount = 0;

logger.error = function(...args) {
  errorCount++;
  winston.error(...args);

  // Алерт при большом количестве ошибок
  if (errorCount > 100) {
    // Отправить email/SMS/Telegram уведомление
    sendAlert(`Too many errors: ${errorCount}`);
  }
};
```

---

## Метрики для мониторинга

### Обязательные:
- Uptime (доступность API)
- Response time (время ответа)
- Error rate (частота ошибок)
- Memory usage (использование памяти)
- CPU usage

### Дополнительные:
- Database query time
- Rate limiter hits
- Active users
- Requests per minute

---

## Dashboard (опционально)

### Grafana + Prometheus

Для визуализации метрик в production.

### Установка Prometheus client

```bash
npm install prom-client
```

### Пример

```javascript
const promClient = require('prom-client');

// Включаем сбор default метрик
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

// Custom метрики
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code']
});

// Endpoint для Prometheus
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
```

---

## Рекомендации

### Для малых проектов:
1. Winston для логов
2. Uptime Robot для мониторинга доступности
3. Sentry для трекинга ошибок (free tier)

### Для средних проектов:
1. Winston + file rotation
2. Sentry (платный план)
3. Простые метрики через /metrics endpoint

### Для больших проектов:
1. Datadog/New Relic (full observability)
2. Grafana + Prometheus
3. ELK Stack для логов

---

## Алерты

### Email уведомления через Nodemailer

```javascript
const nodemailer = require('nodemailer');

async function sendAlert(message) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.ALERT_EMAIL,
      pass: process.env.ALERT_PASSWORD
    }
  });

  await transporter.sendMail({
    from: process.env.ALERT_EMAIL,
    to: 'admin@example.com',
    subject: '🚨 Production Alert',
    text: message
  });
}
```

### Telegram уведомления

```javascript
async function sendTelegramAlert(message) {
  const token = process.env.ALERT_BOT_TOKEN;
  const chatId = process.env.ALERT_CHAT_ID;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `🚨 ${message}`
    })
  });
}
```

---

## Checklist для Production

- [ ] Sentry/Datadog/New Relic настроен
- [ ] Winston логирование в файлы
- [ ] Health check endpoint работает
- [ ] Uptime monitoring настроен
- [ ] Алерты на критические ошибки
- [ ] Dashboard для метрик (опционально)
- [ ] Log rotation настроена
- [ ] Error rate alerts
- [ ] Performance monitoring
