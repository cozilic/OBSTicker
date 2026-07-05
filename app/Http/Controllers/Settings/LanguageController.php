<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\LanguageUpdateRequest;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class LanguageController extends Controller
{
    public function edit(): Response
    {
        return Inertia::render('settings/language', [
            'locales' => [
                ['value' => 'en', 'label' => 'English'],
                ['value' => 'sv', 'label' => 'Svenska'],
            ],
        ]);
    }

    public function update(LanguageUpdateRequest $request): RedirectResponse
    {
        $request->user()->forceFill($request->validated())->save();

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Language updated.')]);

        return to_route('language.edit');
    }
}
