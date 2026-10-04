import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { normalizeTagId, TAG_ID_LENGTH } from '../tag-id';

/**
 * Validates a collar tag id path parameter before it reaches the database.
 * Accepts lowercase input and normalises it to uppercase.
 */
@Injectable()
export class TagIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const normalized = normalizeTagId(value);
    if (!normalized) {
      throw new BadRequestException(
        `tagId must be ${TAG_ID_LENGTH} characters from the tag alphabet`,
      );
    }
    return normalized;
  }
}
