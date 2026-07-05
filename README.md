# OBSTicker

OBSTicker is a Laravel + Inertia React app for running a live ticker overlay in OBS. It supports public text submissions, an admin dashboard, RSS feeds, moderators, and a fullscreen public ticker view.

The project is open source and can be downloaded, modified, and self-hosted from GitHub:

https://github.com/cozilic/OBSTicker

<p align="center">
    <img
        src="./public/images/ticker-logo-readme.png"
        alt="OBSTicker logo"
        width="820"
    />
</p>

## Requirements

- PHP 8.4.1+
- Composer
- Node.js 20+
- SQLite, MySQL, or PostgreSQL

## Local setup

```bash
git clone https://github.com/cozilic/OBSTicker.git
cd OBSTicker
composer install
npm install
cp .env.example .env
php artisan key:generate
php artisan migrate
```

Configure your database in `.env` before running migrations if you are not using SQLite.

## Development

```bash
composer run dev
```

## Production build

```bash
npm run build
```

## Self-hosting

OBSTicker deploys like a standard Laravel application. Use any VPS, Laravel Forge, Laravel Cloud, Docker host, or shared host that supports PHP, Composer, Node.js builds, and a database.

### 1. Prepare the server

Install:

- PHP 8.4.1+ with the extensions required by Laravel
- Composer
- Node.js 20+
- A database: SQLite, MySQL, MariaDB, or PostgreSQL
- A web server such as Nginx or Apache pointing to the `public/` directory

### 2. Clone and install

```bash
git clone https://github.com/cozilic/OBSTicker.git
cd OBSTicker
composer install --no-dev --optimize-autoloader
npm ci
npm run build
cp .env.example .env
php artisan key:generate
```

### 3. Configure `.env`

Set at least:

```dotenv
APP_NAME=OBSTicker
APP_ENV=production
APP_DEBUG=false
APP_URL=https://your-domain.example

DB_CONNECTION=sqlite
```

For SQLite, create the database file and make sure the web server user can write to it:

```bash
touch database/database.sqlite
```

For MySQL, MariaDB, or PostgreSQL, set the normal `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD` values instead.

### 4. Run migrations and cache production config

```bash
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

### 5. File permissions

Make sure the web server can write to:

```bash
storage
bootstrap/cache
database/database.sqlite
```

The exact command depends on your server user, for example:

```bash
chown -R www-data:www-data storage bootstrap/cache database/database.sqlite
```

### 6. Scheduler and queues

If your deployment uses queued jobs, run a queue worker:

```bash
php artisan queue:work --sleep=3 --tries=3 --timeout=90
```

Run Laravel's scheduler every minute from cron:

```cron
* * * * * cd /path/to/OBSTicker && php artisan schedule:run >> /dev/null 2>&1
```

### 7. OBS setup

Add a Browser Source in OBS and point it to:

```text
https://your-domain.example/ticker
```

For chroma-key output, use:

```text
https://your-domain.example/ticker?chroma=1
```

Share the public submission page with viewers:

```text
https://your-domain.example/submit
```

Use the admin dashboard to manage messages, RSS feeds, moderators, and appearance:

```text
https://your-domain.example/ticker-admin
```

## Tests

```bash
php artisan test
```

## Main routes

- `/ticker` - fullscreen ticker view
- `/ticker/payload` - JSON payload for the ticker
- `/submit` - public submission page
- `/ticker-admin` - admin dashboard

## Features

- Queue and display admin text
- Accept public text submissions
- Pull and rotate RSS feeds
- Configure animation, colors, layout, and chroma key
- Manage moderators
