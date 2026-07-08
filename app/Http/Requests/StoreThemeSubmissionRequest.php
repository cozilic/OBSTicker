<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreThemeSubmissionRequest extends FormRequest
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
            'theme_name' => ['required', 'string', 'max:80'],
            'author_name' => ['required', 'string', 'max:80'],
            'submitter_name' => ['nullable', 'string', 'max:80'],
            'submitter_email' => ['nullable', 'email', 'max:255'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'theme_zip' => ['nullable', 'file', 'mimes:zip', 'max:10240', 'required_without:theme_url'],
            'theme_url' => ['nullable', 'url', 'max:2048', 'required_without:theme_zip'],
        ];
    }
}
