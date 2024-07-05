// import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
// import { Channel } from 'discord.js';
// import { DiscordService } from '../../discord/discord.service';
// import { ConfigService } from '@nestjs/config';
// import { AlbionApiService } from './albion.api.service';
// import { InjectRepository } from '@mikro-orm/nestjs';
// import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
// import { EntityRepository } from '@mikro-orm/core';
// import { AlbionRegistrationRetriesEntity } from '../../database/entities/albion.registration.retries.entity';
// import { AlbionRegistrationService } from './albion.registration.service';
//
// @Injectable()
// export class AlbionRegistrationRetryService implements OnApplicationBootstrap {
//   private readonly logger = new Logger(AlbionRegistrationRetryService.name);
//
//   private verificationChannel: Channel;
//   private retriesEnabled = true;
//
//   constructor(
//     private readonly discordService: DiscordService,
//     private readonly config: ConfigService,
//     private readonly albionRegistrationService: AlbionRegistrationService,
//     @InjectRepository(AlbionRegistrationRetriesEntity) private readonly AlbionRegistrationRetriesRepository: EntityRepository<AlbionRegistrationRetriesEntity>,
//   ) {}
//
//   // Won't bother verifying that the channel exists as that's done by the registration service.
//   // If it doesn't exist we'll just turn off retries.
//
//   async onApplicationBootstrap() {
//     const verifyChannelId = this.config.get('discord.channels.albionRegistration');
//     this.verificationChannel = await this.discordService.getChannel(verifyChannelId);
//     if (!this.verificationChannel?.isTextBased()) {
//       this.logger.error(`Could not find channel with ID ${verifyChannelId}! Turning off retries!`);
//       this.retriesEnabled = false;
//     }
//   }
//
//   async retryRegistrations() {
//     if (!this.retriesEnabled) {
//       return;
//     }
//
//     const retries = await this.AlbionRegistrationRetriesRepository.findAll();
//
//     for (const retry of retries) {
//       const fakeDTO = {
//         character: retry.characterName,
//         server: retry.server,
//       };
//       try {
//         await this.albionRegistrationService.handleRegistration(
//           fakeDTO,);
//         await this.AlbionRegistrationRetriesRepository.removeAndFlush(retry);
//       }
//       catch (err) {
//         this.logger.error(`Failed to register character ${characterName} for ${discordId} on guild ${guildId}!`);
//         retry.tries++;
//         await this.AlbionRegistrationRetriesRepository.persistAndFlush(retry);
//       }
//     }
//   }
// }
