import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../services/prisma.service';
import { Device, LocationSource } from '@prisma/client';
import {
  RegisterDeviceDto,
  UpdateLocationDto,
  DeviceResponseDto,
  LocationStatusDto,
} from './dto';
import { AUDIT_EVENT_NAMES } from '../audit/audit-event-names';
import { IAuditEventPayload } from '../audit/interfaces/audit-event-payload.interface';

@Injectable()
export class DeviceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Register or update a device (idempotent operation)
   * Upserts by device_uuid, updates push token and location
   */
  async register(
    dto: RegisterDeviceDto,
    userId: string,
  ): Promise<DeviceResponseDto> {
    const now = new Date();

    // Check if device already exists
    const existing = await this.prisma.device.findFirst({
      where: {
        device_uuid: dto.device_uuid,
        user_id: userId,
      },
    });

    let deviceId: string;
    let isNewDevice = false;

    if (existing) {
      // Capture oldValues for audit
      const oldValues = {
        platform: existing.platform,
        osVersion: existing.os_version,
        appVersion: existing.app_version,
        pushToken: existing.push_token ? '[REDACTED]' : null,
        location: {
          gpsLat: existing.gps_latitude,
          gpsLon: existing.gps_longitude,
        },
      };

      // Update existing device
      await this.prisma.device.update({
        where: { id: existing.id },
        data: {
          platform: dto.platform,
          os_version: dto.os_version,
          app_version: dto.app_version,
          push_token: dto.push_token || existing.push_token,
          push_token_updated_at: dto.push_token
            ? now
            : existing.push_token_updated_at,
          last_app_open: now,
          // Update location data if provided
          gps_latitude: dto.location?.gps?.latitude ?? existing.gps_latitude,
          gps_longitude: dto.location?.gps?.longitude ?? existing.gps_longitude,
          gps_accuracy: dto.location?.gps?.accuracy ?? existing.gps_accuracy,
          gps_updated_at: dto.location?.gps ? now : existing.gps_updated_at,
          ip_address: dto.location?.ipAddress ?? existing.ip_address,
          postal_codes: dto.location?.postalCodes ?? existing.postal_codes,
        },
      });

      // Update GPS geometry if coordinates provided
      if (dto.location?.gps) {
        await this.prisma.$executeRaw`
          UPDATE devices
          SET gps_point = ST_SetSRID(ST_MakePoint(${dto.location.gps.longitude}, ${dto.location.gps.latitude}), 4326)
          WHERE id = ${existing.id}::text
        `;
      }

      // TODO: Update IP geometry asynchronously (geocoding service)

      deviceId = existing.id;

      // Emit audit event for update
      try {
        const auditPayload: IAuditEventPayload = {
          eventType: 'UPDATE',
          entityType: 'DEVICE',
          entityId: parseInt(deviceId, 10),
          userId: parseInt(userId, 10),
          action: 'device_updated',
          description: `Updated device ${dto.device_uuid}`,
          oldValues,
          newValues: {
            platform: dto.platform,
            osVersion: dto.os_version,
            appVersion: dto.app_version,
            pushTokenUpdated: !!dto.push_token,
            locationUpdated: !!dto.location,
          },
          success: true,
        };
        this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, auditPayload);
      } catch (error) {
        // Silent fail for audit events
      }
    } else {
      isNewDevice = true;
      // Create new device
      const result = await this.prisma.$queryRaw<Array<{ id: string }>>`
        INSERT INTO devices (
          user_id,
          device_uuid,
          platform,
          os_version,
          app_version,
          push_token,
          push_token_updated_at,
          gps_latitude,
          gps_longitude,
          gps_accuracy,
          gps_point,
          gps_updated_at,
          ip_address,
          postal_codes,
          last_app_open
        )
        VALUES (
          ${userId}::text,
          ${dto.device_uuid},
          ${dto.platform}::"DevicePlatform",
          ${dto.os_version},
          ${dto.app_version},
          ${dto.push_token || null},
          ${dto.push_token ? now : null},
          ${dto.location?.gps?.latitude ?? null},
          ${dto.location?.gps?.longitude ?? null},
          ${dto.location?.gps?.accuracy ?? null},
          ${dto.location?.gps ? `ST_SetSRID(ST_MakePoint(${dto.location.gps.longitude}, ${dto.location.gps.latitude}), 4326)` : null},
          ${dto.location?.gps ? now : null},
          ${dto.location?.ipAddress || null},
          ${dto.location?.postalCodes ? JSON.stringify(dto.location.postalCodes) : '[]'}::jsonb,
          ${now}
        )
        RETURNING id
      `;

      deviceId = result[0].id;

      // TODO: Geocode IP address asynchronously

      // Emit audit event for creation
      try {
        const auditPayload: IAuditEventPayload = {
          eventType: 'CREATE',
          entityType: 'DEVICE',
          entityId: parseInt(deviceId, 10),
          userId: parseInt(userId, 10),
          action: 'device_registered',
          description: `Registered new device ${dto.device_uuid}`,
          newValues: {
            deviceUuid: dto.device_uuid,
            platform: dto.platform,
            osVersion: dto.os_version,
            appVersion: dto.app_version,
            hasPushToken: !!dto.push_token,
            hasLocation: !!dto.location,
          },
          success: true,
        };
        this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.CREATED, auditPayload);
      } catch (error) {
        // Silent fail for audit events
      }
    }

    // Fetch and return the device
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        saved_zones: true,
      },
    });

    return this.mapToResponseDto(device!);
  }

  /**
   * Update device location (GPS and/or postal codes)
   */
  async updateLocation(
    deviceId: string,
    dto: UpdateLocationDto,
    userId: string,
  ): Promise<DeviceResponseDto> {
    // Verify device belongs to user
    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        user_id: userId,
      },
    });

    if (!device) {
      throw new NotFoundException(
        `Device with ID ${deviceId} not found or does not belong to user`,
      );
    }

    // Capture oldValues for audit
    const oldValues = {
      gpsLatitude: device.gps_latitude,
      gpsLongitude: device.gps_longitude,
      gpsAccuracy: device.gps_accuracy,
      postalCodes: device.postal_codes,
    };

    const now = new Date();

    // Update device
    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        gps_latitude: dto.gps?.latitude ?? device.gps_latitude,
        gps_longitude: dto.gps?.longitude ?? device.gps_longitude,
        gps_accuracy: dto.gps?.accuracy ?? device.gps_accuracy,
        gps_updated_at: dto.gps ? now : device.gps_updated_at,
        postal_codes: dto.postal_codes ?? device.postal_codes,
      },
    });

    // Update GPS geometry if coordinates provided
    if (dto.gps) {
      await this.prisma.$executeRaw`
        UPDATE devices
        SET gps_point = ST_SetSRID(ST_MakePoint(${dto.gps.longitude}, ${dto.gps.latitude}), 4326)
        WHERE id = ${deviceId}::text
      `;
    }

    // Emit audit event
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'UPDATE',
        entityType: 'LOCATION',
        entityId: parseInt(deviceId, 10),
        userId: parseInt(userId, 10),
        action: 'location_updated',
        description: `Updated location for device ${deviceId}`,
        oldValues,
        newValues: {
          gpsLatitude: dto.gps?.latitude,
          gpsLongitude: dto.gps?.longitude,
          gpsAccuracy: dto.gps?.accuracy,
          postalCodes: dto.postal_codes,
        },
        metadata: {
          source: dto.gps ? 'GPS' : 'POSTAL_CODE',
        },
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, auditPayload);
    } catch (error) {
      // Silent fail for audit events
    }

    // Fetch updated device
    const updated = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        saved_zones: true,
      },
    });

    return this.mapToResponseDto(updated!);
  }

  /**
   * Update push notification token
   */
  async updatePushToken(
    deviceId: string,
    pushToken: string,
    userId: string,
  ): Promise<DeviceResponseDto> {
    // Verify device belongs to user
    const device = await this.prisma.device.findFirst({
      where: {
        id: deviceId,
        user_id: userId,
      },
    });

    if (!device) {
      throw new NotFoundException(
        `Device with ID ${deviceId} not found or does not belong to user`,
      );
    }

    // Capture oldValues for audit (redact sensitive token)
    const oldValues = {
      pushTokenUpdatedAt: device.push_token_updated_at,
      hadPushToken: !!device.push_token,
    };

    // Update push token
    const updated = await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        push_token: pushToken,
        push_token_updated_at: new Date(),
      },
      include: {
        saved_zones: true,
      },
    });

    // Emit audit event (sensitive token is automatically redacted by audit system)
    try {
      const auditPayload: IAuditEventPayload = {
        eventType: 'UPDATE',
        entityType: 'DEVICE',
        entityId: parseInt(deviceId, 10),
        userId: parseInt(userId, 10),
        action: 'push_token_updated',
        description: `Updated push notification token for device ${deviceId}`,
        oldValues,
        newValues: {
          pushTokenUpdated: true,
        },
        success: true,
      };
      this.eventEmitter.emit(AUDIT_EVENT_NAMES.ENTITY.UPDATED, auditPayload);
    } catch (error) {
      // Silent fail for audit events
    }

    return this.mapToResponseDto(updated);
  }

  /**
   * Find all devices for a user
   */
  async findByUserId(userId: string): Promise<DeviceResponseDto[]> {
    const devices = await this.prisma.device.findMany({
      where: { user_id: userId },
      include: {
        saved_zones: true,
      },
      orderBy: { last_app_open: 'desc' },
    });

    return devices.map((d) => this.mapToResponseDto(d));
  }

  /**
   * Calculate location status for a device
   */
  getLocationStatus(device: Device, savedZoneCount: number): LocationStatusDto {
    const hasGps =
      device.gps_latitude !== null && device.gps_longitude !== null;
    const hasIpLocation =
      device.ip_latitude !== null && device.ip_longitude !== null;
    const postalCodeCount = device.postal_codes.length;

    let gpsAgeHours: number | undefined;
    let gpsFreshness: 'fresh' | 'stale' | 'old' | 'none' = 'none';

    if (hasGps && device.gps_updated_at) {
      gpsAgeHours =
        (Date.now() - device.gps_updated_at.getTime()) / (1000 * 60 * 60);

      if (gpsAgeHours < 2) {
        gpsFreshness = 'fresh';
      } else if (gpsAgeHours < 24) {
        gpsFreshness = 'stale';
      } else {
        gpsFreshness = 'old';
      }
    }

    // Determine primary source
    let primarySource: LocationSource;
    if (hasGps && gpsFreshness === 'fresh') {
      primarySource = LocationSource.GPS;
    } else if (postalCodeCount > 0) {
      primarySource = LocationSource.POSTAL_CODE;
    } else if (hasIpLocation) {
      primarySource = LocationSource.IP_ADDRESS;
    } else if (hasGps) {
      primarySource = LocationSource.GPS;
    } else {
      primarySource = LocationSource.IP_ADDRESS; // Fallback even if not available
    }

    return {
      hasGps,
      gpsAgeHours,
      gpsFreshness,
      hasIpLocation,
      postalCodeCount,
      savedZoneCount,
      primarySource,
    };
  }

  /**
   * Map Device to response DTO
   */
  private mapToResponseDto(
    device: Device & { saved_zones?: any[] },
  ): DeviceResponseDto {
    const savedZoneCount = device.saved_zones?.length || 0;
    const locationStatus = this.getLocationStatus(device, savedZoneCount);

    return {
      id: device.id,
      user_id: device.user_id,
      device_uuid: device.device_uuid,
      platform: device.platform,
      os_version: device.os_version,
      app_version: device.app_version,
      gps_latitude: device.gps_latitude,
      gps_longitude: device.gps_longitude,
      gps_accuracy: device.gps_accuracy,
      gps_updated_at: device.gps_updated_at,
      ip_address: device.ip_address,
      ip_latitude: device.ip_latitude,
      ip_longitude: device.ip_longitude,
      postal_codes: device.postal_codes,
      push_token: device.push_token,
      push_token_updated_at: device.push_token_updated_at,
      last_app_open: device.last_app_open,
      location_status: locationStatus,
      created_at: device.created_at,
      updated_at: device.updated_at,
    };
  }
}
