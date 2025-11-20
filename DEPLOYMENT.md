# 🚀 Production Deployment Guide

**Версия:** 2.2.0
**Статус:** Production Ready

---

## 📋 Pre-Deployment Checklist

### 1. Требования к серверу:

**Минимальные требования:**
- CPU: 2 cores
- RAM: 2GB
- Disk: 20GB SSD
- OS: Ubuntu 20.04+ / Debian 11+ / CentOS 8+

**Рекомендуемые:**
- CPU: 4 cores
- RAM: 4GB
- Disk: 50GB SSD

### 2. Установленное ПО:

```bash
# Docker & Docker Compose
sudo apt update
sudo apt install docker.io docker-compose

# Git
sudo apt install git

# Certbot (для SSL)
sudo apt install certbot
```

---

## 🎯 Deployment Steps

### Вариант 1: SQLite (простой)

```bash
# 1. Клонируйте репозиторий
git clone <repo-url>
cd prikol

# 2. Создайте .env файл
cp .env.example .env
nano .env
# Установите TELEGRAM_BOT_TOKEN

# 3. Запустите через Docker
docker-compose up -d

# 4. Проверьте логи
docker-compose logs -f
```

**Готово!** Приложение доступно на `http://your-server-ip:3000`

---

### Вариант 2: PostgreSQL (рекомендуется)

```bash
# 1. Клонируйте репозиторий
git clone <repo-url>
cd prikol

# 2. Создайте .env для production
cp .env.production.example .env.production
nano .env.production

# Установите:
# - POSTGRES_PASSWORD (сильный пароль!)
# - TELEGRAM_BOT_TOKEN
# - Другие переменные

# 3. ВАЖНО: Создайте nginx.conf
# Если планируете использовать nginx (рекомендуется для production):
cp nginx.conf.example nginx.conf
nano nginx.conf
# Замените yourdomain.com на ваш реальный домен

# Если НЕ используете nginx, закомментируйте nginx service в docker-compose.prod.yml

# 4. Запустите с PostgreSQL
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# 5. Проверьте health
curl http://localhost:3000/api/health

# 6. Проверьте логи
docker-compose -f docker-compose.prod.yml logs -f
```

---

## 🔒 SSL/HTTPS Setup (Let's Encrypt)

### 1. Установите Certbot

```bash
sudo apt install certbot python3-certbot-nginx
```

### 2. Получите сертификат

```bash
# Остановите nginx если запущен
docker-compose -f docker-compose.prod.yml stop nginx

# Получите сертификат
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Сертификаты будут в:
# /etc/letsencrypt/live/yourdomain.com/
```

### 3. Настройте nginx

```bash
# Скопируйте пример конфига
cp nginx.conf.example nginx.conf

# Отредактируйте - замените yourdomain.com на ваш домен
nano nginx.conf

# Создайте симлинки на сертификаты
mkdir -p ssl
sudo ln -s /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/
sudo ln -s /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/

# Перезапустите с nginx
docker-compose -f docker-compose.prod.yml up -d
```

### 4. Автообновление сертификатов

```bash
# Добавьте в crontab
sudo crontab -e

# Добавьте строку:
0 3 * * * certbot renew --quiet && docker-compose -f /path/to/prikol/docker-compose.prod.yml restart nginx
```

---

## 🔄 Database Migration

### При первом деплое:

```bash
# Миграции выполняются автоматически через docker-entrypoint.sh
# Но если нужно вручную:

docker-compose -f docker-compose.prod.yml exec web npx prisma migrate deploy
```

### При обновлении схемы:

```bash
# 1. Создайте миграцию локально
npx prisma migrate dev --name your_migration_name

# 2. Закоммитьте prisma/migrations/

# 3. На сервере после git pull:
docker-compose -f docker-compose.prod.yml exec web npx prisma migrate deploy
```

---

## 📊 Monitoring & Maintenance

### Просмотр логов:

```bash
# Все сервисы
docker-compose -f docker-compose.prod.yml logs -f

# Только web
docker-compose -f docker-compose.prod.yml logs -f web

# Только bot
docker-compose -f docker-compose.prod.yml logs -f bot

# PostgreSQL
docker-compose -f docker-compose.prod.yml logs -f postgres
```

### Health checks:

```bash
# API health
curl http://localhost:3000/api/health

# PostgreSQL health
docker-compose -f docker-compose.prod.yml exec postgres pg_isready

# Все сервисы
docker-compose -f docker-compose.prod.yml ps
```

### Backup базы данных:

```bash
# Создать backup
docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump -U prikol_user prikol > backup_$(date +%Y%m%d_%H%M%S).sql

# Восстановить из backup
cat backup_20250118_120000.sql | docker-compose -f docker-compose.prod.yml exec -T postgres psql -U prikol_user prikol
```

### Автоматические бэкапы:

```bash
# Создайте скрипт backup.sh
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/prikol"
mkdir -p $BACKUP_DIR
cd /path/to/prikol
docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump -U prikol_user prikol | gzip > $BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql.gz
# Удалить бэкапы старше 30 дней
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete
EOF

chmod +x backup.sh

# Добавьте в crontab (ежедневно в 2:00)
0 2 * * * /path/to/backup.sh
```

---

## 🔄 Updates & Rollbacks

### Обновление приложения:

```bash
# 1. Backup БД
./backup.sh

# 2. Pull changes
git pull origin main

# 3. Rebuild & restart
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build

# 4. Проверить логи
docker-compose -f docker-compose.prod.yml logs -f
```

### Rollback:

```bash
# 1. Откатить Git
git log  # найдите нужный commit
git reset --hard <commit-hash>

# 2. Rebuild
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build

# 3. Восстановить БД если нужно
cat backup_file.sql | docker-compose -f docker-compose.prod.yml exec -T postgres psql -U prikol_user prikol
```

---

## 🛡️ Security Best Practices

### 1. Firewall (UFW):

```bash
# Разрешить только нужные порты
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

### 2. Fail2ban:

```bash
# Установка
sudo apt install fail2ban

# Конфигурация
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 3. Обновления системы:

```bash
# Автоматические обновления безопасности
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 4. Мониторинг доступа:

```bash
# Просмотр попыток подключения
sudo tail -f /var/log/auth.log

# Активные соединения
sudo netstat -tulpn
```

---

## 📈 Performance Tuning

### PostgreSQL оптимизация:

Создайте файл `postgres-tuning.conf`:

```conf
# Для 4GB RAM сервера
shared_buffers = 1GB
effective_cache_size = 3GB
maintenance_work_mem = 256MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 10MB
min_wal_size = 1GB
max_wal_size = 4GB
```

Добавьте в docker-compose.prod.yml:

```yaml
postgres:
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ./postgres-tuning.conf:/etc/postgresql/postgresql.conf:ro
  command: postgres -c config_file=/etc/postgresql/postgresql.conf
```

---

## 🆘 Troubleshooting

### Problem: Docker can't start

```bash
# Check Docker status
sudo systemctl status docker

# Restart Docker
sudo systemctl restart docker

# Check logs
sudo journalctl -u docker -f
```

### Problem: Database connection failed

```bash
# Check PostgreSQL logs
docker-compose -f docker-compose.prod.yml logs postgres

# Check if PostgreSQL is ready
docker-compose -f docker-compose.prod.yml exec postgres pg_isready

# Restart PostgreSQL
docker-compose -f docker-compose.prod.yml restart postgres
```

### Problem: Bot not responding

```bash
# Check bot logs
docker-compose -f docker-compose.prod.yml logs bot

# Verify token
docker-compose -f docker-compose.prod.yml exec bot env | grep TELEGRAM

# Restart bot
docker-compose -f docker-compose.prod.yml restart bot
```

### Problem: High CPU/Memory

```bash
# Check resource usage
docker stats

# Check PostgreSQL queries
docker-compose -f docker-compose.prod.yml exec postgres psql -U prikol_user -d prikol -c "SELECT * FROM pg_stat_activity;"

# Optimize database
docker-compose -f docker-compose.prod.yml exec postgres vacuumdb -U prikol_user -d prikol --analyze
```

---

## 📞 Support

При возникновении проблем:

1. Проверьте логи: `docker-compose logs -f`
2. Проверьте health: `curl http://localhost:3000/api/health`
3. Проверьте документацию: `README.md`, `COMPREHENSIVE_FINAL_SUMMARY.md`
4. Проверьте GitHub Issues

---

**Создано с ❤️**

**Версия:** 2.2.0
**Дата:** 2025-11-18
