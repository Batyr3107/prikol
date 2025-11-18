const { spawn } = require('child_process');

console.log('🚀 Запуск веб-сервера и Telegram бота...\n');

// Запуск веб-сервера
const server = spawn('node', ['src/server.js'], {
  stdio: 'inherit',
  shell: true
});

// Запуск бота
const bot = spawn('node', ['src/bot.js'], {
  stdio: 'inherit',
  shell: true
});

// Обработка завершения процессов
server.on('close', (code) => {
  console.log(`\n❌ Веб-сервер остановлен с кодом ${code}`);
  bot.kill();
  process.exit(code);
});

bot.on('close', (code) => {
  console.log(`\n❌ Telegram бот остановлен с кодом ${code}`);
  server.kill();
  process.exit(code);
});

// Обработка SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\n\n🛑 Остановка сервисов...');
  server.kill('SIGINT');
  bot.kill('SIGINT');
  setTimeout(() => process.exit(0), 1000);
});
