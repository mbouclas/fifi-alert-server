import { Module, forwardRef } from '@nestjs/common';
import { LocationService } from './location.service';
import { GeospatialService } from './geospatial.service';
import { PrismaService } from '../services/prisma.service';
import { UserModule } from '../user/user.module';

@Module({
    imports: [forwardRef(() => UserModule)],
    providers: [LocationService, GeospatialService, PrismaService],
    exports: [LocationService, GeospatialService],
})
export class LocationModule { }
