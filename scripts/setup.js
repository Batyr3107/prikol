const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setup() {
  console.log('🚀 Настройка приложения "Свод Мужских Правил"\n');

  // Проверяем существование .env
  const envPath = path.join(__dirname, '..', '.env');
  const envExamplePath = path.join(__dirname, '..', '.env.example');

  if (!fs.existsSync(envPath)) {
    console.log('📝 Создание .env файла...');

    const botToken = await question('Введите токен Telegram бота (получите у @BotFather): ');
    const port = await question('Порт для веб-сервера (по умолчанию 3000): ') || '3000';

    const envContent = `# Telegram Bot Token (получить у @BotFather)
TELEGRAM_BOT_TOKEN=${botToken}

# Server Configuration
PORT=${port}
HOST=localhost

# Database
DATABASE_URL="file:./dev.db"
`;

    fs.writeFileSync(envPath, envContent);
    console.log('✅ Файл .env создан\n');
  } else {
    console.log('ℹ️  Файл .env уже существует\n');
  }

  // Устанавливаем зависимости
  console.log('📦 Установка зависимостей...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Зависимости установлены\n');
  } catch (error) {
    console.error('❌ Ошибка при установке зависимостей');
    process.exit(1);
  }

  // Генерируем Prisma Client
  console.log('🔧 Генерация Prisma Client...');
  try {
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('✅ Prisma Client сгенерирован\n');
  } catch (error) {
    console.error('❌ Ошибка при генерации Prisma Client');
    process.exit(1);
  }

  // Выполняем миграции
  console.log('🗄️  Инициализация базы данных...');
  try {
    execSync('npx prisma migrate dev --name init', { stdio: 'inherit' });
    console.log('✅ База данных инициализирована\n');
  } catch (error) {
    console.error('❌ Ошибка при инициализации базы данных');
    process.exit(1);
  }

  console.log('🎉 Настройка завершена!\n');
  console.log('Для запуска приложения используйте:');
  console.log('  npm start       - запустить веб-сервер');
  console.log('  npm run bot     - запустить Telegram бота');
  console.log('  npm run both    - запустить оба сервиса одновременно\n');

  rl.close();
}

setup().catch(error => {
  console.error('❌ Ошибка при настройке:', error);
  rl.close();
  process.exit(1);
});
