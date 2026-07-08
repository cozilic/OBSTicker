<?php

return [
    'themes' => [
        'official_catalog_enabled' => env('TICKER_THEME_OFFICIAL_CATALOG_ENABLED', false),
        'catalog_enabled' => env('TICKER_THEME_CATALOG_ENABLED', true),
        'landing_link_enabled' => env('TICKER_THEME_LANDING_LINK_ENABLED', false),
        'official_catalog_url' => env('TICKER_THEME_OFFICIAL_CATALOG_URL', 'https://ticker.norrnet.online/themes'),
    ],
    'owner_email' => env('TICKER_OWNER_EMAIL', 'aggen81@gmail.com'),
];
