<?php

namespace App\Http\Requests;

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
            'label_position' => ['required', Rule::in(['left', 'right'])],
            'chroma_key_color' => ['required', Rule::in(['green', 'blue', 'magenta'])],
            'image_url' => ['nullable', 'url', 'max:2048'],
            'crawl_duration_seconds' => ['required', 'integer', 'min:10', 'max:180'],
            'message_display_seconds' => ['required', 'integer', 'min:5', 'max:120'],
            'poll_interval_seconds' => ['required', 'integer', 'min:5', 'max:120'],
            'require_auth_to_submit' => ['sometimes', 'boolean'],
            'show_rss' => ['sometimes', 'boolean'],
        ];
    }
}
