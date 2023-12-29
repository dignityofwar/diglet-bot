import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PS2VerificationAttemptEntity } from './entities/ps2.verification.attempt.entity';
import { PS2MembersEntity } from './entities/ps2.members.entity';
import { AlbionRegistrationsEntity } from './entities/albion.registrations.entity';
import { AlbionGuildMembersEntity } from './entities/albion.guildmembers.entity';
import { DatabaseService } from './services/database.service';
import { ActivityEntity } from './entities/activity.entity';

@Module({
  imports: [
    MikroOrmModule.forRoot(),
    MikroOrmModule.forFeature({
      entities: [
        ActivityEntity,
        AlbionGuildMembersEntity,
        AlbionRegistrationsEntity,
        PS2MembersEntity,
        PS2VerificationAttemptEntity,
      ],
    }),
  ],
  providers: [DatabaseService],
  exports: [MikroOrmModule, DatabaseService],
})
export class DatabaseModule {}
