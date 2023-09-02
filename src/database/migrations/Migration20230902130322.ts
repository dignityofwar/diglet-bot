import { Migration } from '@mikro-orm/migrations';

export class Migration20230902130322 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table `ps2verification_attempt_entity` drop `guild_member`;');
    this.addSql('alter table `ps2verification_attempt_entity` drop `guild_message`;');
  }

  async down(): Promise<void> {
    this.addSql('alter table `ps2verification_attempt_entity` add `guild_member` varchar(255) not null, add `guild_message` varchar(255) not null;');
  }

}
