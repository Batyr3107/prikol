# 🔍 Аудит кода - Проверка #1

**Дата:** 2025-11-18
**Статус:** Найдено проблем: 23 (3 критических, 8 средних, 12 низких)

---

## 🔴 КРИТИЧЕСКИЕ ПРОБЛЕМЫ (3)

### 1. Конфликт автоинкремента ID пользователей
**Серьезность:** 🔴 CRITICAL
**Файлы:** `prisma/schema.prisma:14`, `public/app.js:7`, `src/server.js:172,230`

**Проблема:**
В схеме базы данных User.id определен как autoincrement:
```prisma
model User {
  id  Int  @id @default(autoincrement())
}
```

Но код вручную генерирует и устанавливает ID:
```javascript
// app.js
userId = Date.now() * 1000 + Math.floor(Math.random() * 1000);

// server.js
user = await prisma.user.create({
  data: {
    id: parseInt(userId),  // ❌ Конфликт с autoincrement!
    displayName: userName
  }
});
```

**Последствия:**
- Возможные коллизии ID при автоинкременте
- Нарушение принципов проектирования БД
- Autoincrement счетчик может пропускать вручную вставленные ID
- Проблемы при миграции на PostgreSQL

**Решение:**
Убрать `@default(autoincrement())` из User.id в schema.prisma, так как ID управляются вручную.

---

### 2. Неправильный порядок API роутов
**Серьезность:** 🔴 CRITICAL
**Файл:** `src/server.js:110-281`

**Проблема:**
```javascript
// Строка 110
app.get('/api/rules/:id', async (req, res) => { ... });

// Строка 281 - ИДЕТ ПОСЛЕ!
app.get('/api/rules/top/:limit', async (req, res) => { ... });
```

В Express порядок роутов важен! Запрос `/api/rules/top/10` будет перехвачен первым роутом, который примет "top" как ID. **Endpoint /api/rules/top/:limit не работает!**

**Решение:**
Переместить `/api/rules/top/:limit` ПЕРЕД `/api/rules/:id`.

---

### 3. Отсутствие санитизации в Telegram боте
**Серьезность:** 🔴 CRITICAL
**Файлы:** `src/bot.js:189-192`, `src/server.js:173,230`

**Проблема:**
При создании правил через бота и веб не используется `sanitizeText()`:

```javascript
// bot.js - создание правила
const rule = await prisma.rule.create({
  data: {
    title: state.title,        // ❌ НЕ САНИТИЗИРОВАНО
    description: description,  // ❌ НЕ САНИТИЗИРОВАНО
    authorId: user.id
  }
});

// server.js - создание пользователя
data: {
  id: parseInt(userId),
  displayName: userName || 'Аноним'  // ❌ НЕ САНИТИЗИРОВАНО
}
```

Имена пользователей также не санитизируются перед сохранением в БД!

**Последствия:**
- Null bytes в БД
- Control characters
- Потенциальные проблемы при выводе
- Нарушение валидации данных

**Решение:**
Использовать `sanitizeText()` и `validateRule()` из utils.js везде перед сохранением в БД.

---

## 🟡 СРЕДНИЕ ПРОБЛЕМЫ (8)

### 4. Rate Limiter использует вероятностную очистку
**Серьезность:** 🟡 MEDIUM
**Файл:** `src/middleware/rateLimiter.js:27`

**Проблема:**
```javascript
if (Math.random() < 0.01) {
  this.cleanup();
}
```

Очистка происходит случайно (1% вероятность). Это может привести к:
- Утечке памяти при большом количестве клиентов
- Непредсказуемому поведению
- Накоплению устаревших данных

**Решение:**
Использовать `setInterval()` для периодической очистки каждые N минут.

---

### 5. Асинхронные forEach в боте
**Серьезность:** 🟡 MEDIUM
**Файлы:** `src/bot.js:114-116`, `src/bot.js:152-154`

**Проблема:**
```javascript
for (const rule of rules) {
  const rating = rule.votes.reduce((sum, vote) => sum + vote.value, 0);
  await sendRuleMessage(chatId, rule, rating);
}

// НО в другом месте:
topRules.forEach(async (rule, index) => {
  await sendRuleMessage(chatId, rule, rule.rating, index + 1);  // ❌ await в forEach!
});
```

`forEach` не ждет async функций - сообщения могут отправляться в неправильном порядке.

**Решение:**
Заменить все `forEach` на `for...of` loop для async операций.

---

### 6. Отсутствие транзакций при голосовании
**Серьезность:** 🟡 MEDIUM
**Файлы:** `src/server.js:246-261`, `src/bot.js:246-260`

**Проблема:**
При обновлении голоса выполняется несколько операций с БД без транзакции:
1. Check существующего голоса
2. Update или Create голоса
3. Fetch всех голосов для подсчета

Если операция прервется между шагами, данные могут быть inconsistent.

**Решение:**
Обернуть операции голосования в Prisma transaction.

---

### 7. Отсутствие валидации ENV переменных
**Серьезность:** 🟡 MEDIUM
**Файлы:** `src/server.js`, `src/bot.js`

**Проблема:**
Только `TELEGRAM_BOT_TOKEN` проверяется в bot.js. Нет проверки:
- `DATABASE_URL`
- `PORT` (валидация диапазона)
- `NODE_ENV` (допустимые значения)

**Последствия:**
Приложение может запуститься с неверной конфигурацией и упасть позже.

**Решение:**
Добавить валидацию всех обязательных ENV переменных при старте.

---

### 8. Нет rate limiting в Telegram боте
**Серьезность:** 🟡 MEDIUM
**Файл:** `src/bot.js`

**Проблема:**
Web API имеет rate limiting, но Telegram бот - нет. Пользователь может спамить команды.

**Решение:**
Добавить простой in-memory rate limiting для команд бота.

---

### 9. Docker volumes определены но не используются
**Серьезность:** 🟡 MEDIUM
**Файл:** `docker-compose.yml:34-36`

**Проблема:**
```yaml
volumes:
  data:  # Определены, но не используются
  logs:
```

Сервисы используют bind mounts (`./data`, `./logs`), а не named volumes.

**Решение:**
Либо использовать named volumes, либо удалить их определение.

---

### 10. Console.log вместо logger в bot.js
**Серьезность:** 🟡 MEDIUM
**Файл:** `src/bot.js:17,119,156,206,280`

**Проблема:**
Бот использует `console.log` и `console.error` вместо централизованного logger.

**Решение:**
Импортировать и использовать logger из `middleware/logger.js`.

---

### 11. Отсутствие CSRF protection
**Серьезность:** 🟡 MEDIUM
**Файл:** `src/server.js`

**Проблема:**
Есть упоминание CSRF в комментариях, но реальная защита не реализована.

**Решение:**
Для веб-приложения без сессий CSRF менее критичен, но стоит добавить хотя бы SameSite cookie policy.

---

## 🟢 НИЗКИЕ ПРОБЛЕМЫ (12)

### 12. CSP разрешает unsafe-inline для стилей
**Серьезность:** 🟢 LOW
**Файл:** `src/server.js:20`

**Проблема:**
```javascript
"style-src 'self' 'unsafe-inline'"
```

**Примечание:** Необходимо для текущего CSS, но можно улучшить.

---

### 13. Отсутствие .dockerignore
**Серьезность:** 🟢 LOW
**Файл:** Отсутствует

**Проблема:**
Без `.dockerignore` в образ могут попасть ненужные файлы (node_modules, .git, .env).

**Решение:**
Создать `.dockerignore` с исключениями.

---

### 14. NODE_ENV не в .env.example
**Серьезность:** 🟢 LOW
**Файл:** `.env.example`

**Проблема:**
Код проверяет `NODE_ENV` во многих местах, но переменная не документирована.

**Решение:**
Добавить в `.env.example`.

---

### 15. Отсутствие health checks в docker-compose
**Серьезность:** 🟢 LOW
**Файл:** `docker-compose.yml`

**Проблема:**
Нет health checks для сервисов.

**Решение:**
Добавить healthcheck директивы.

---

### 16. Graceful shutdown не ждет завершения polling
**Серьезность:** 🟢 LOW
**Файл:** `src/bot.js:370-375`

**Проблема:**
```javascript
await bot.stopPolling();
await prisma.$disconnect();
process.exit(0);
```

`stopPolling()` может вернуться до полной остановки.

**Решение:**
Добавить небольшую задержку или обработку событий.

---

### 17-23. Остальные низкие проблемы:
- Inconsistent error messages (разный формат)
- Hardcoded database path в docker-compose
- Missing request timeout configuration
- No pagination limit enforcement documentation
- Missing API versioning (v1, v2)
- No metrics/monitoring endpoints
- Missing database connection pool configuration

---

## 📊 Сводка

| Категория | Количество | Приоритет |
|-----------|-----------|-----------|
| 🔴 Критические | 3 | НЕМЕДЛЕННО |
| 🟡 Средние | 8 | ВЫСОКИЙ |
| 🟢 Низкие | 12 | СРЕДНИЙ |
| **ВСЕГО** | **23** | |

---

## 🎯 План исправлений

### Приоритет 1 (КРИТИЧЕСКИЙ):
1. ✅ Исправить порядок API роутов
2. ✅ Убрать autoincrement из User.id
3. ✅ Добавить санитизацию во всех местах создания данных

### Приоритет 2 (ВЫСОКИЙ):
4. ✅ Исправить async forEach в боте
5. ✅ Добавить валидацию правил в боте
6. ✅ Исправить rate limiter cleanup
7. ✅ Добавить санитизацию userName
8. ✅ Использовать logger в bot.js

### Приоритет 3 (СРЕДНИЙ):
9. ⏳ Добавить транзакции (опционально)
10. ⏳ Добавить .dockerignore
11. ⏳ Улучшить docker-compose
12. ⏳ ENV validation

---

## ✅ Что уже хорошо:

- ✅ XSS защита (escapeHtml)
- ✅ Security headers
- ✅ Rate limiting на API
- ✅ Input validation (частично)
- ✅ Error handling
- ✅ Graceful shutdown
- ✅ Docker support
- ✅ Logging middleware
- ✅ Sanitization функции (нужно только использовать везде)

---

**Следующий шаг:** Исправить все критические и высокие проблемы.
