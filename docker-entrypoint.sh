#!/bin/sh
set -e

echo "🔧 Running database migrations..."
npx prisma migrate deploy

echo "✅ Database ready!"
echo "🚀 Starting application..."

# Выполняем переданную команду
exec "$@"
