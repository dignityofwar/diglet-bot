import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PS2VerificationAttemptEntity } from './entities/ps2.verification.attempt.entity';
import { PS2MembersEntity } from './entities/ps2.members.entity';
import { AlbionRegistrationsEntity } from './entities/albion.registrations.entity';
import { AlbionGuildMembersEntity } from './entities/albion.guildmembers.entity';

@Module({
  imports: [
    MikroOrmModule.forRoot(),
    MikroOrmModule.forFeature({
      entities: [
        AlbionGuildMembersEntity,
        AlbionRegistrationsEntity,
        PS2MembersEntity,
        PS2VerificationAttemptEntity,
      ],
    }),
  ],
  providers: [],
  exports: [MikroOrmModule],
})
export class DatabaseModule {}
