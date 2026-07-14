#!/bin/sh

set -e

cd /app

if [ ! -f ".env" ]; then
    cp .env.example .env
fi

php artisan key:generate --force || true

php artisan storage:link || true

php artisan config:clear || true
php artisan cache:clear || true

php artisan config:cache
php artisan route:cache
php artisan view:cache

exec "$@"
