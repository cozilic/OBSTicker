#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/OBSTicker}"
LOCK_FILE="${LOCK_FILE:-/tmp/obsticker-deploy.lock}"

if ! command -v php >/dev/null 2>&1; then
    echo "php is required" >&2
    exit 1
fi

if ! php -r 'exit(version_compare(PHP_VERSION, "8.4.1", ">=") ? 0 : 1);'; then
    echo "PHP 8.4.1 or newer is required" >&2
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

if sudo -n true >/dev/null 2>&1; then
    sudo chown -R "$(id -un):$(id -gn)" "$APP_DIR"
fi

if ! git fetch origin main; then
    if sudo -n true >/dev/null 2>&1; then
        sudo chown -R "$(id -un):$(id -gn)" "$APP_DIR"
    fi

    git fetch origin main
fi

if ! git reset --hard origin/main; then
    if sudo -n true >/dev/null 2>&1; then
        sudo chown -R "$(id -un):$(id -gn)" "$APP_DIR"
        git reset --hard origin/main
    else
        echo "Unable to reset repository permissions. Run a one-time chown on the server." >&2
        exit 1
    fi
fi

git clean -fd

fix_permissions() {
    mkdir -p storage/logs storage/framework/cache storage/framework/sessions bootstrap/cache

    chmod -R a+rwX storage bootstrap/cache database

    if [ -f database/database.sqlite ]; then
        chmod 666 database/database.sqlite
    fi
}

fix_permissions

composer install --no-interaction --no-dev --prefer-dist --optimize-autoloader --no-progress
php artisan route:clear
npm ci
npm run build

php artisan optimize:clear
php artisan migrate --force
php artisan storage:link || true
fix_permissions
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan queue:restart || true
