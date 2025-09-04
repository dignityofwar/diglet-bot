import { Migration } from '@mikro-orm/migrations';

export class Migration20230903145500 extends Migration {

  async up(): Promise<void> {
    this.addSql('alter table `ps2members_entity` modify `manual_created_by_discord_id` varchar(255) null default null, modify `manual_created_by_discord_name` varchar(255) null default null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table `ps2members_entity` modify `manual_created_by_discord_id` varchar(255) not null, modify `manual_created_by_discord_name` varchar(255) not null;');
  }

}
