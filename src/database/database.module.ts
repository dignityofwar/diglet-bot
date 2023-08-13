import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PS2VerificationAttemptEntity } from './entities/ps2.verification.attempt.entity';
import { PS2MembersEntity } from './entities/ps2.members.entity';

@Module({
  imports: [
    MikroOrmModule.forRoot(),
    MikroOrmModule.forFeature({
      entities: [PS2VerificationAttemptEntity, PS2MembersEntity],
    }),
  ],
  providers: [],
  exports: [MikroOrmModule],
})
export class DatabaseModule {}
