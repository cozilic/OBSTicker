<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $theme_name
 * @property string $theme_slug
 * @property string $author_name
 * @property string|null $submitter_name
 * @property string|null $submitter_email
 * @property string $source_type
 * @property string|null $source_url
 * @property string $archive_path
 * @property string $status
 * @property string|null $notes
 * @property int|null $reviewed_by_id
 * @property Carbon|null $reviewed_at
 * @property Carbon|null $published_at
 * @property string|null $rejection_reason
 * @property string|null $published_theme_slug
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property-read User|null $reviewer
 */
class ThemeSubmission extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'theme_name',
        'theme_slug',
        'author_name',
        'submitter_name',
        'submitter_email',
        'source_type',
        'source_url',
        'archive_path',
        'status',
        'notes',
        'reviewed_by_id',
        'reviewed_at',
        'published_at',
        'rejection_reason',
        'published_theme_slug',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'reviewed_at' => 'datetime',
            'published_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, ThemeSubmission>
     */
    public function reviewer(): BelongsTo
    {
        /** @var BelongsTo<User, ThemeSubmission> $relation */
        $relation = $this->belongsTo(User::class, 'reviewed_by_id');

        return $relation;
    }
}
