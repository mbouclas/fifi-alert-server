import { Module } from '@nestjs/common';
import { LocationService } from './location.service';
import { GeospatialService } from './geospatial.service';
import { PrismaService } from '../services/prisma.service';

@Module({
    providers: [LocationService, GeospatialService, PrismaService],
    exports: [LocationService, GeospatialService],
})
export class LocationModule { }
