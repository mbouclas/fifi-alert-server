import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { LangInput, ResolveLangPipe } from '../pipes/resolve-lang.pipe';

/**
 * Extracts the raw language hints (`?lang=` and `Accept-Language`) from the request.
 */
const RawLang = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): LangInput => {
        const request = ctx.switchToHttp().getRequest();
        return {
            query: request.query?.lang,
            header: request.headers?.['accept-language'],
        };
    },
);

/**
 * Injects the resolved language code for the current request.
 *
 * Resolution: `?lang=` -> `Accept-Language` -> default language.
 * Unknown or inactive codes fall back to the default.
 *
 * @example
 * ```ts
 * @Get()
 * findAll(@Lang() lang: string) { ... }
 * ```
 */
export const Lang = () => RawLang(ResolveLangPipe);
