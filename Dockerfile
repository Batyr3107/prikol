# Используем официальный Node.js образ
FROM node:18-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем Prisma схему
COPY prisma ./prisma

# Генерируем Prisma Client
RUN npx prisma generate

# Копируем остальные файлы приложения
COPY . .

# Копируем и делаем исполняемым entrypoint скрипт
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Открываем порт
EXPOSE 3000

# Используем entrypoint для инициализации БД
ENTRYPOINT ["docker-entrypoint.sh"]

# Запускаем приложение
CMD ["npm", "start"]
