# OBSTicker

OBSTicker is a Laravel + Inertia React app for running a live ticker overlay in OBS. It supports public text submissions, an admin dashboard, RSS feeds, moderators, and a fullscreen public ticker view.

The project is open source and can be downloaded, modified, and self-hosted from GitHub:

https://github.com/cozilic/OBSTicker

<p align="center">
    <a href="https://github.com/cozilic/OBSTicker/actions/workflows/tests.yml">
        <img
            src="https://github.com/cozilic/OBSTicker/actions/workflows/tests.yml/badge.svg?branch=main"
            alt="Tests status"
        />
    </a>
    <a href="https://github.com/cozilic/OBSTicker/actions/workflows/lint.yml">
        <img
            src="https://github.com/cozilic/OBSTicker/actions/workflows/lint.yml/badge.svg?branch=main"
            alt="Lint status"
        />
    </a>
    <a href="https://github.com/cozilic/OBSTicker/actions/workflows/deploy.yml">
        <img
            src="https://github.com/cozilic/OBSTicker/actions/workflows/deploy.yml/badge.svg?branch=main"
            alt="Deploy status"
        />
    </a>
</p>

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

### Theme catalog

OBSTicker can show an official shared theme catalog on the main site and optionally link self-hosted installs back to it.

Use these environment variables:

```dotenv
TICKER_THEME_OFFICIAL_CATALOG_ENABLED=true
TICKER_THEME_OFFICIAL_CATALOG_URL=https://ticker.norrnet.online/themes
TICKER_THEME_LANDING_LINK=true
```

- `TICKER_THEME_OFFICIAL_CATALOG_ENABLED` enables the shared official themes catalog routes on the main site.
- `TICKER_THEME_OFFICIAL_CATALOG_URL` points self-hosted installs to the official catalog and submission endpoint.
- `TICKER_THEME_LANDING_LINK` shows the official themes link on the main landing page when the official catalog is enabled.

Recommended setup:

- On `ticker.norrnet.online`, set `TICKER_THEME_OFFICIAL_CATALOG_ENABLED=true` and `TICKER_THEME_LANDING_LINK=true`.
- On self-hosted installs, set `TICKER_THEME_OFFICIAL_CATALOG_URL` to the official catalog URL, but keep `TICKER_THEME_OFFICIAL_CATALOG_ENABLED=false` so the official catalog itself is not exposed locally.
- After changing any of these values, run `php artisan config:clear` and rebuild the frontend if needed.

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

Ticker style PNG files can be added to:

```text
public/ticker-styles
```

The dashboard scans this folder automatically and lists the PNG files in the ticker style dropdown.

## Quality checks

The current codebase passes linting, type analysis, production build, and the test suite.

```bash
npm run lint:check
composer types:check
npm run build
php artisan test --compact
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
- Select ticker styles from PNG files
- Manage moderators
