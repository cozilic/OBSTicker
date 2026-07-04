#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/OBSTicker}"
LOCK_FILE="${LOCK_FILE:-/tmp/obsticker-deploy.lock}"

if ! command -v php >/dev/null 2>&1; then
    echo "php is required" >&2
    exit 1
fi

if ! command -v composer >/dev/null 2>&1; then
    echo "composer is required" >&2
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required" >&2
    exit 1
fi

if [ ! -d "$APP_DIR" ]; then
    echo "Application directory not found: $APP_DIR" >&2
    exit 1
fi

exec 9>"$LOCK_FILE"
flock -n 9

cd "$APP_DIR"

cleanup() {
    php artisan up >/dev/null 2>&1 || true
}

trap cleanup EXIT

php artisan down --retry=60 >/dev/null 2>&1 || true

git fetch origin main
git reset --hard origin/main
git clean -fd

composer install --no-interaction --no-dev --prefer-dist --optimize-autoloader --no-progress
npm ci
npm run build

php artisan optimize:clear
php artisan migrate --force
php artisan storage:link || true
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan queue:restart || true
