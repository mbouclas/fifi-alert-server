import { PartialType } from '@nestjs/swagger';
import { CreatePetTypeDto } from './create-pet-type.dto';

/**
 * DTO for updating a pet type.
 */
export class UpdatePetTypeDto extends PartialType(CreatePetTypeDto) {}
