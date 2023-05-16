import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { AlbionRegisterCommand } from './commands/register.command';

@Module({
  imports: [DiscordModule.forFeature()],
  providers: [AlbionRegisterCommand],
})
export class AlbionModule {}
