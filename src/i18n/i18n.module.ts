import { Global, Module } from '@nestjs/common';
import { SharedModule } from '@shared/shared.module';
import { LanguageService } from './language.service';
import { ResolveLangPipe } from './pipes/resolve-lang.pipe';
import { LanguagesController } from './languages.controller';

/**
 * Internationalisation module.
 *
 * Global so that `@Lang()` (which relies on `ResolveLangPipe` -> `LanguageService`)
 * works in any controller without each feature module importing this one.
 */
@Global()
@Module({
    imports: [SharedModule],
    providers: [LanguageService, ResolveLangPipe],
    controllers: [LanguagesController],
    exports: [LanguageService, ResolveLangPipe],
})
export class I18nModule { }
