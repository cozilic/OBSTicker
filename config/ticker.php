<?php

return [
    'themes' => [
        'catalog_enabled' => env('TICKER_THEME_CATALOG_ENABLED', true),
        'landing_link_enabled' => env('TICKER_THEME_LANDING_LINK_ENABLED', false),
        'official_catalog_url' => env('TICKER_THEME_OFFICIAL_CATALOG_URL', 'https://ticker.norrnet.online/themes'),
    ],
];
