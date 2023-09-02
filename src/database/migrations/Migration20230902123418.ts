import { Migration } from '@mikro-orm/migrations';

export class Migration20230902123418 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table `ps2verification_attempt_entity` add `character_name` varchar(255) not null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table `ps2verification_attempt_entity` drop `character_name`;');
  }

}
