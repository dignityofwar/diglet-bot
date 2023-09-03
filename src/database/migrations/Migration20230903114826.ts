import { Migration } from '@mikro-orm/migrations';

export class Migration20230903114826 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table `ps2members_entity` add `manual` varchar(255) not null default false, add `manual_created_by_discord_id` varchar(255) not null, add `manual_created_by_discord_name` varchar(255) not null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table `ps2members_entity` drop `manual`;');
    this.addSql('alter table `ps2members_entity` drop `manual_created_by_discord_id`;');
    this.addSql('alter table `ps2members_entity` drop `manual_created_by_discord_name`;');
  }

}
