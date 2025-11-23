const { PrismaClient } = require('@prisma/client');
const logger = require('./middleware/logger');

const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
    { level: 'info', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' }
  ]
});

// Логирование медленных запросов в development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    if (e.duration > 100) {
      // > 100ms
      logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
    }
  });
}

// Обработка ошибок подключения
prisma
  .$connect()
  .then(() => {
    logger.success('✅ База данных подключена');
  })
  .catch((error) => {
    logger.error('❌ Ошибка подключения к БД:', error);
    process.exit(1);
  });

// Graceful disconnect
async function disconnect() {
  await prisma.$disconnect();
  logger.info('База данных отключена');
}

module.exports = prisma;
module.exports.disconnect = disconnect;
