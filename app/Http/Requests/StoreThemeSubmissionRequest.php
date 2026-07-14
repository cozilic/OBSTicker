<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreThemeSubmissionRequest extends FormRequest
{
    /**
     * Maximum theme zip size in megabytes. Keep in sync with the
     * client-side MAX_THEME_ZIP_SIZE_MB constant in
     * resources/js/lib/hooks/use-theme-zip-size-guard.ts.
     */
    public const int MAX_THEME_ZIP_SIZE_MB = 10;

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
            'theme_name' => ['required', 'string', 'max:80'],
            'author_name' => ['required', 'string', 'max:80'],
            'submitter_name' => ['nullable', 'string', 'max:80'],
            'submitter_email' => ['nullable', 'email', 'max:255'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'theme_zip' => [
                'nullable',
                'file',
                'mimes:zip',
                'max:'.(self::MAX_THEME_ZIP_SIZE_MB * 1024),
                'required_without:theme_url',
            ],
            'theme_url' => ['nullable', 'url', 'max:2048', 'required_without:theme_zip'],
        ];
    }

    /**
     * Get custom validation messages for the defined rules.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'theme_zip.max' => __(
                'The theme zip is too large. Maximum size is :mb MB.',
                ['mb' => self::MAX_THEME_ZIP_SIZE_MB],
            ),
        ];
    }

    /**
     * Get custom attribute names for validator errors.
     *
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return [
            'theme_zip' => __('Theme zip'),
        ];
    }
}
