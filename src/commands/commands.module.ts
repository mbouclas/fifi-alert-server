import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { SharedModule } from '@shared/shared.module';
import { UserModule } from '../user/user.module';
import { HelpCommand } from '@commands/help.command';
import {
  AdminCommand,
  CreateAdminCommand,
  UpdatePasswordCommand,
  ConvertToAdminCommand,
  ListAdminsCommand,
  AdminCreateQuestions,
  AdminUpdatePasswordQuestions,
  AdminConvertQuestions,
} from '@commands/admin';

@Module({
  imports: [DiscoveryModule, SharedModule, UserModule],
  providers: [
    HelpCommand,
    // Admin commands
    AdminCommand,
    CreateAdminCommand,
    UpdatePasswordCommand,
    ConvertToAdminCommand,
    ListAdminsCommand,
    // Question sets
    AdminCreateQuestions,
    AdminUpdatePasswordQuestions,
    AdminConvertQuestions,
  ],
})
export class CommandsModule {}
