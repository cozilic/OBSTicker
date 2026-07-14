# Server upload limits

The `/ticker-admin/theme` form posts a single source image to
`POST /ticker-admin/settings/stitch/preview` (Laravel route
`ticker.settings.stitch.preview`). The validator caps the
upload at **4 MB** (`max:4096` KB) and the trimmed-PNG compile
also lives in this same envelope. Before Laravel can apply
that cap, PHP — and sometimes the web server in front of it —
must accept the bytes.

When any of those layers rejects the upload below the Laravel
threshold, the validator message collapses into a generic
`"<field> failed to upload."` 422 (no size, mimetype, or
dimension detail). This page lists every knob to check.

## PHP (`php.ini` or FPM pool `www.conf`)

Applies on shared hosts and most distros running `php-fpm`.

| Setting               | Recommended | Notes                                                             |
| --------------------- | ----------- | ----------------------------------------------------------------- |
| `upload_max_filesize` | `8M`        | Per-file cap. Must be ≥ validator's `max:4096` (4 MB).            |
| `post_max_size`       | `12M`       | Whole-body cap. Must exceed `upload_max_filesize` + form fields.  |
| `memory_limit`        | `256M`      | Compilation runs through GD; below 128 MB can OOM on big banners. |
| `max_execution_time`  | `60`        | Compile path is synchronous.                                      |
| `max_input_time`      | `60`        | Same.                                                             |

Apply via:

```ini
; /etc/php/8.3/fpm/php.ini  (path varies — Ubuntu: /etc/php/8.3/fpm/php.ini)
upload_max_filesize = 8M
post_max_size = 12M
memory_limit = 256M
max_execution_time = 60
max_input_time = 60
```

Reload:

```bash
sudo systemctl reload php8.3-fpm    # or: php-fpm, php8.2-fpm, ...
```

Verify with `php -i | grep upload_max_filesize` from the CLI,
or `<pre><?php echo ini_get('upload_max_filesize'); ?></pre>`
from a one-off PHP page. The client-side preflight surfaces
the same number in its alert text when the upload fails.

## Nginx (fronting PHP-FPM)

Default is `1m`. Bump to ≥ 12 MB so the body never gets cut
off upstream of PHP.

```nginx
# /etc/nginx/conf.d/ticker.conf
client_max_body_size 12m;
```

Reload: `sudo systemctl reload nginx`.

## Apache (with mod_php or `mod_proxy_fcgi`)

```apache
LimitRequestBody 12582912   # 12 MB in bytes
```

## Sanity check from Laravel

Want to surface the live effective cap on the dashboard so
operators can see it at a glance? Add this to
`AppServiceProvider::boot()`:

```php
use Inertia\Inertia;

Inertia::share('phpUploadMaxBytes', (int) ini_get('upload_max_filesize'));
```

Then on the React side:

```typescript
const { props } = usePage<{ phpUploadMaxBytes: number }>();
```

— and pass `phpUploadMaxBytes` to the theme page as a prop.
The client-side preflight (`MAX_SOURCE_BYTES = 4096 * 1024`)
and the shared prop diverge only when the server is
misconfigured; that divergence is exactly the case where the
alert hint kicks in.

## Quick triage flow

1. Reproduce in a browser.
2. Open DevTools → Network → the `preview` request. Look at
   the response body for `errors.source_image`. If it ends in
   `failed to upload.`, PHP dropped the file — check this
   page.
3. If it ends in `must be an image.` or `must not be greater
than 4096 kilobytes.`, the upload reached Laravel; the
   validator is the bottleneck, not the server caps. Compress
   / resize the artwork.

## Why the client-side preflight exists

`resources/js/pages/ticker/theme.tsx` short-circuits the
upload before the network call when the picked file is
over 4 MB (this is exactly `MAX_SOURCE_BYTES`). Once that
gate is in place, the only times a 422 still arrives are:

- An under-cap file (≤ 4 MB) dropped by `post_max_size`,
  `upload_max_filesize`, or the web server's body limit.
- A valid file rejected by `image`/`mimes` (mimetype, not
  PNG/JPG/JPEG, or corrupt header).

The catch handler's "Server upload limit hit before
validation" hint is wired to detect the first case from
the response body. The other cases flow through unchanged.
