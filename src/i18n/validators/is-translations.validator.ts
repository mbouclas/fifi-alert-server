import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
} from 'class-validator';

/** Language codes accepted as translation keys: 2-8 lowercase letters. */
const LANG_CODE_RE = /^[a-z]{2,8}$/;

export interface IsTranslationsOptions {
    /** Maximum length of each translated value. Default 100. */
    maxLength?: number;
}

/**
 * Validates a translations map `{ [langCode]: string }`:
 * - must be a plain object with at least one key
 * - keys must look like language codes (lowercase, 2-8 letters)
 * - values must be non-empty strings up to `maxLength` characters
 *
 * Whether the keys are *active* languages and whether the default language is
 * present is checked in the service (requires a DB lookup).
 */
export function IsTranslations(
    options: IsTranslationsOptions = {},
    validationOptions?: ValidationOptions,
): PropertyDecorator {
    const maxLength = options.maxLength ?? 100;

    return (object: object, propertyName: string | symbol) => {
        registerDecorator({
            name: 'isTranslations',
            target: object.constructor,
            propertyName: propertyName as string,
            options: validationOptions,
            validator: {
                validate(value: unknown): boolean {
                    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                        return false;
                    }
                    const entries = Object.entries(value as Record<string, unknown>);
                    if (entries.length === 0) {
                        return false;
                    }
                    return entries.every(
                        ([code, name]) =>
                            LANG_CODE_RE.test(code) &&
                            typeof name === 'string' &&
                            name.trim().length > 0 &&
                            name.length <= maxLength,
                    );
                },
                defaultMessage(args: ValidationArguments): string {
                    return `${args.property} must be an object mapping language codes to non-empty names (max ${maxLength} characters)`;
                },
            },
        });
    };
}
