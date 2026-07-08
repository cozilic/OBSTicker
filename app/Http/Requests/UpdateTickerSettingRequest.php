<?php

namespace App\Http\Requests;

use App\Services\TickerStyleRepository;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateTickerSettingRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'headline' => ['required', 'string', 'max:80'],
            'rss_headline' => ['required', 'string', 'max:80'],
            'user_headline' => ['required', 'string', 'max:80'],
            'background_color' => ['required', 'hex_color'],
            'text_color' => ['required', 'hex_color'],
            'accent_color' => ['required', 'hex_color'],
            'canvas_width' => ['required', 'integer', 'min:320', 'max:7680'],
            'canvas_height' => ['required', 'integer', 'min:180', 'max:4320'],
            'animation_style' => ['required', Rule::in(['slide-left', 'fade', 'bounce', 'zoom'])],
            'animation_duration_seconds' => ['required', 'integer', 'min:1', 'max:10'],
            'animation_out_duration_seconds' => ['required', 'integer', 'min:1', 'max:10'],
            'shape_style' => ['required', Rule::in(['bar', 'pill', 'angled'])],
            'ticker_style' => ['nullable', 'string', 'max:255', $this->tickerStyleRule()],
            'ticker_use_image_style' => ['sometimes', 'boolean'],
            'label_position' => ['required', Rule::in(['left', 'right'])],
            'chroma_key_color' => ['required', Rule::in(['green', 'blue', 'magenta'])],
            'image_url' => ['nullable', 'url', 'max:2048'],
            'crawl_duration_seconds' => ['required', 'integer', 'min:10', 'max:180'],
            'message_display_seconds' => ['required', 'integer', 'min:5', 'max:120'],
            'poll_interval_seconds' => ['required', 'integer', 'min:5', 'max:120'],
            'require_auth_to_submit' => ['sometimes', 'boolean'],
            'moderator_only_submissions' => ['sometimes', 'boolean'],
            'show_rss' => ['sometimes', 'boolean'],
        ];
    }

    private function tickerStyleRule(): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail): void {
            if ($value === null || $value === '' || in_array($value, ['__default', '__none'], true)) {
                return;
            }

            if (! is_string($value) || ! app(TickerStyleRepository::class)->exists($value)) {
                $fail('The selected ticker style is invalid.');
            }
        };
    }
}
