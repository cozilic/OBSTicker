<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $theme_slug
 * @property string $theme_name
 * @property string $theme_label
 * @property string|null $author_name
 * @property int|null $original_submission_id
 * @property int|null $approved_by_id
 * @property Carbon|null $approved_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read ThemeSubmission|null $originalSubmission
 * @property-read User|null $approver
 */
class PublishedTheme extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'theme_slug',
        'theme_name',
        'theme_label',
        'author_name',
        'original_submission_id',
        'approved_by_id',
        'approved_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'approved_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<ThemeSubmission, PublishedTheme>
     */
    public function originalSubmission(): BelongsTo
    {
        /** @var BelongsTo<ThemeSubmission, PublishedTheme> $relation */
        $relation = $this->belongsTo(ThemeSubmission::class, 'original_submission_id');

        return $relation;
    }

    /**
     * @return BelongsTo<User, PublishedTheme>
     */
    public function approver(): BelongsTo
    {
        /** @var BelongsTo<User, PublishedTheme> $relation */
        $relation = $this->belongsTo(User::class, 'approved_by_id');

        return $relation;
    }
}
