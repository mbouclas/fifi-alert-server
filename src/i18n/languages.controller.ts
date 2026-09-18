import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '../auth/decorators/allow-anonymous.decorator';
import { LanguageService } from './language.service';
import { LanguagesListResponseDto } from './dto';

/**
 * Public endpoint listing the languages the API can serve.
 *
 * Client apps call this once to learn the available languages and the default,
 * then pass `?lang=<code>` (or an `Accept-Language` header) on other requests.
 */
@Controller('languages')
@ApiTags('Languages')
export class LanguagesController {
    constructor(private readonly languageService: LanguageService) { }

    @Get()
    @AllowAnonymous()
    @ApiOperation({
        summary: 'List available languages',
        description:
            'Returns all active languages and the default one. No authentication required.',
    })
    @ApiResponse({
        status: 200,
        description: 'Active languages and the default language code',
        type: LanguagesListResponseDto,
    })
    async findAll(): Promise<LanguagesListResponseDto> {
        const languages = await this.languageService.getActive();
        const defaultCode = await this.languageService.getDefaultCode();

        return {
            default: defaultCode,
            languages: languages.map((l) => ({
                code: l.code,
                name: l.name,
                nativeName: l.nativeName,
                isDefault: l.isDefault,
                sortOrder: l.sortOrder,
            })),
        };
    }
}
