import { ApiProperty } from '@nestjs/swagger';

/**
 * A single language the API can serve.
 */
export class LanguageResponseDto {
    @ApiProperty({
        description:
            'ISO 639-1 language code. Use this value for the `lang` query parameter.',
        example: 'el',
    })
    code: string;

    @ApiProperty({ description: 'English name of the language', example: 'Greek' })
    name: string;

    @ApiProperty({
        description: 'Name of the language in the language itself',
        example: 'Ελληνικά',
    })
    nativeName: string;

    @ApiProperty({
        description:
            'Whether this is the default language used when no `lang` is requested',
        example: true,
    })
    isDefault: boolean;

    @ApiProperty({ description: 'Display order', example: 10 })
    sortOrder: number;
}

/**
 * Response of `GET /languages`.
 */
export class LanguagesListResponseDto {
    @ApiProperty({ description: 'Code of the default language', example: 'el' })
    default: string;

    @ApiProperty({
        description: 'All active languages ordered by sortOrder',
        type: [LanguageResponseDto],
    })
    languages: LanguageResponseDto[];
}
