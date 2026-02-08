import { PartialType } from '@nestjs/swagger';
import { CreatePetDto } from './create-pet.dto';

/**
 * DTO for updating a pet
 * All fields from CreatePetDto are optional
 */
export class UpdatePetDto extends PartialType(CreatePetDto) {}
