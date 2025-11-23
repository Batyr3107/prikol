// Swagger JSDoc аннотации для API endpoints
// Этот файл содержит только документацию, не код

/**
 * @swagger
 * /api/rules:
 *   get:
 *     summary: Получить список правил
 *     tags: [Rules]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Номер страницы
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *         description: Количество правил на странице
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Поисковый запрос
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [rating, createdAt]
 *           default: rating
 *         description: Сортировка
 *     responses:
 *       200:
 *         description: Список правил с пагинацией
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rules:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Rule'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *       500:
 *         description: Ошибка сервера
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/rules/top/{limit}:
 *   get:
 *     summary: Получить топ правил
 *     tags: [Rules]
 *     parameters:
 *       - in: path
 *         name: limit
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Количество топ правил
 *     responses:
 *       200:
 *         description: Топ правил по рейтингу
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Rule'
 *       500:
 *         description: Ошибка сервера
 */

/**
 * @swagger
 * /api/rules/{id}:
 *   get:
 *     summary: Получить правило по ID
 *     tags: [Rules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID правила
 *     responses:
 *       200:
 *         description: Данные правила
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Rule'
 *       400:
 *         description: Некорректный ID
 *       404:
 *         description: Правило не найдено
 *       500:
 *         description: Ошибка сервера
 */

/**
 * @swagger
 * /api/rules:
 *   post:
 *     summary: Создать новое правило
 *     tags: [Rules]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRule'
 *     responses:
 *       201:
 *         description: Правило успешно создано
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Rule'
 *       400:
 *         description: Ошибка валидации
 *       429:
 *         description: Превышен лимит запросов
 *       500:
 *         description: Ошибка сервера
 */

/**
 * @swagger
 * /api/rules/{id}/vote:
 *   post:
 *     summary: Проголосовать за правило
 *     tags: [Rules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID правила
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Vote'
 *     responses:
 *       200:
 *         description: Голос успешно учтен
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VoteResponse'
 *       400:
 *         description: Ошибка валидации
 *       429:
 *         description: Превышен лимит запросов
 *       500:
 *         description: Ошибка сервера
 */

/**
 * @swagger
 * /api/stats:
 *   get:
 *     summary: Получить статистику
 *     tags: [Stats]
 *     responses:
 *       200:
 *         description: Статистика платформы
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Stats'
 *       500:
 *         description: Ошибка сервера
 */

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Проверка здоровья API
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API работает
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
