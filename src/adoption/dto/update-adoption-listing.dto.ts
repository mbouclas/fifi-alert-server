import { PartialType } from '@nestjs/swagger';
import { CreateAdoptionListingDto } from './create-adoption-listing.dto';

/**
 * Body for updating an adoption listing. Every field is optional.
 * Pet fields update the linked Pet; `lat` and `lon` must be sent together.
 */
export class UpdateAdoptionListingDto extends PartialType(
  CreateAdoptionListingDto,
) {}
