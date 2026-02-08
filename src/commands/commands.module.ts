import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { SharedModule } from '@shared/shared.module.js';
import { UserModule } from '../user/user.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { HelpCommand } from '@commands/help.command';
import { SimulateCommand } from '@commands/simulate.command';
import { SendTestEmailCommand } from '@commands/send-test-email.command';
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
  imports: [DiscoveryModule, SharedModule, UserModule, SimulationModule],
  providers: [
    HelpCommand,
    SimulateCommand,
    SendTestEmailCommand,
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
