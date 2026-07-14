FROM dunglas/frankenphp:1.4-php8.3

# Installera systempaket
RUN apt-get update && apt-get install -y \
    git \
    unzip \
    zip \
    curl \
    ffmpeg \
    libpng-dev \
    libjpeg62-turbo-dev \
    libwebp-dev \
    libfreetype6-dev \
    libzip-dev \
    libicu-dev \
    libmagickwand-dev \
    && docker-php-ext-configure gd \
        --with-jpeg \
        --with-freetype \
        --with-webp \
    && docker-php-ext-install \
        gd \
        intl \
        bcmath \
        exif \
        opcache \
        pdo \
        pdo_mysql \
        pdo_pgsql \
        zip \
    && pecl install imagick redis \
    && docker-php-ext-enable imagick redis

# Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /app
COPY . .

RUN composer install \
    --no-dev \
    --optimize-autoloader \
    --prefer-dist \
    --no-interaction

RUN mkdir -p storage bootstrap/cache
RUN chown -R www-data:www-data storage bootstrap/cache
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV SERVER_NAME=:80
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
CMD ["frankenphp","run","--config","/etc/caddy/Caddyfile"]
