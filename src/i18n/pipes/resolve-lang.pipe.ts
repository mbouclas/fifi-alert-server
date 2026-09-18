import { Injectable, PipeTransform } from '@nestjs/common';
import { LanguageService } from '../language.service';

/**
 * Raw language hints extracted from a request by the `@Lang()` decorator.
 */
export interface LangInput {
    query?: unknown;
    header?: string;
}

/**
 * Turns the raw `LangInput` into a resolved, active language code.
 *
 * Implemented as an injectable pipe (not via a global ValidationPipe) so the
 * behaviour is identical in production, where no global pipe is registered.
 */
@Injectable()
export class ResolveLangPipe implements PipeTransform<LangInput, Promise<string>> {
    constructor(private readonly languageService: LanguageService) { }

    transform(value: LangInput): Promise<string> {
        return this.languageService.resolve(value?.query, value?.header);
    }
}
