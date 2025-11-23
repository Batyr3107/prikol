# Swagger API Documentation Setup

API документация с использованием Swagger UI.

## Установка

Пакеты уже добавлены в package.json:
```bash
npm install
```

## Подключение к server.js

Добавьте в `src/server.js` после всех middleware:

```javascript
// === В начале файла, с другими require ===
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

// === После app.use(express.static(...)) ===
// Swagger documentation
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Rules Voting API Docs'
  }));
  logger.info('📚 Swagger docs доступны на /api-docs');
}
```

## Использование

### Development:
Swagger будет доступен автоматически:
```
http://localhost:3000/api-docs
```

### Production:
По умолчанию отключен для безопасности.

Включить через .env:
```env
ENABLE_SWAGGER=true
```

## Структура файлов

```
src/
├── swagger.js           # Конфигурация Swagger
└── server.swagger.js    # JSDoc аннотации для endpoints
```

## Обновление документации

Все endpoint'ы уже задокументированы в `server.swagger.js`.

При добавлении нового endpoint, добавьте JSDoc аннотацию:

```javascript
/**
 * @swagger
 * /api/new-endpoint:
 *   get:
 *     summary: Описание endpoint
 *     tags: [YourTag]
 *     responses:
 *       200:
 *         description: Success response
 */
```

## Безопасность

**⚠️ ВАЖНО для Production:**

1. Отключите Swagger в production (по умолчанию)
2. Если нужен в production - защитите authentication:

```javascript
// Пример: Basic Auth для Swagger
const basicAuth = require('express-basic-auth');

app.use('/api-docs', basicAuth({
  users: { 'admin': process.env.SWAGGER_PASSWORD },
  challenge: true
}), swaggerUi.serve, swaggerUi.setup(swaggerSpec));
```

## Особенности

- ✅ Интерактивное тестирование API
- ✅ Автоматическая валидация по схемам
- ✅ Примеры запросов/ответов
- ✅ Поддержка всех HTTP методов
- ✅ Try it out - прямо в браузере

## Скриншоты

После запуска перейдите на `/api-docs` и увидите:
- Список всех endpoints
- Детальное описание каждого
- Схемы данных (models)
- Возможность тестирования прямо в браузере

## Экспорт документации

Swagger spec доступен в JSON:
```
http://localhost:3000/api-docs/swagger.json
```

Можно импортировать в Postman или другие инструменты.
