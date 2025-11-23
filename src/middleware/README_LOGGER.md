# Logger Configuration

Проект поддерживает два варианта логирования:

## 1. Простой Logger (по умолчанию)
**Файл:** `logger.js`

- Легковесный
- Цветной вывод в консоль
- Нет файлового логирования
- Подходит для development

## 2. Winston Logger (production)
**Файл:** `logger.winston.js`

- Профессиональный logger с ротацией файлов
- Логи сохраняются в `logs/`
- Автоматическая ротация по дням
- Раздельные файлы для ошибок, HTTP запросов
- Автоматическое удаление старых логов

### Структура логов:
```
logs/
├── app-2025-11-23.log        # Все логи (info+)
├── error-2025-11-23.log      # Только ошибки
├── http-2025-11-23.log       # HTTP запросы
├── exceptions-2025-11-23.log # Неперехваченные исключения
└── rejections-2025-11-23.log # Неперехваченные promise rejections
```

### Ротация:
- **app logs:** хранятся 14 дней, макс 20MB
- **error logs:** хранятся 30 дней, макс 20MB
- **http logs:** хранятся 7 дней, макс 20MB

## Переключение между логгерами

### Вариант 1: Переименовать файлы (рекомендуется)
```bash
# Для production - используем Winston
mv src/middleware/logger.js src/middleware/logger.simple.js
mv src/middleware/logger.winston.js src/middleware/logger.js

# Для development - возвращаем простой
mv src/middleware/logger.js src/middleware/logger.winston.js
mv src/middleware/logger.simple.js src/middleware/logger.js
```

### Вариант 2: Environment переменная
В `.env`:
```env
# Включить файловое логирование даже в development
LOG_TO_FILE=true

# Уровень логирования (error, warn, info, http, debug)
LOG_LEVEL=info
```

## Production настройка

1. Установите Winston:
```bash
npm install winston winston-daily-rotate-file
```

2. Переключитесь на winston logger (см. выше)

3. Создайте директорию для логов:
```bash
mkdir logs
```

4. Добавьте `logs/` в `.gitignore` (уже добавлено)

5. Настройте `.env`:
```env
NODE_ENV=production
LOG_LEVEL=info
```

## API

Оба logger'а имеют одинаковый API:

```javascript
const logger = require('./middleware/logger');

logger.info('Информационное сообщение');
logger.success('Успешная операция');
logger.warn('Предупреждение');
logger.error('Ошибка', error);
logger.debug('Отладочная информация');

// HTTP middleware
app.use(logger.requestLogger());
```

## Мониторинг логов в production

### Tail логов:
```bash
tail -f logs/app-*.log
tail -f logs/error-*.log
```

### Поиск ошибок:
```bash
grep "ERROR" logs/app-*.log
```

### Анализ HTTP запросов:
```bash
grep "POST" logs/http-*.log
```
