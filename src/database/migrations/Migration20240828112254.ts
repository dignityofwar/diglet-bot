import { Migration } from '@mikro-orm/migrations';

export class Migration20240828112254 extends Migration {

  async up(): Promise<void> {
    this.addSql('create table `activity_stats_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `active_users1d` json not null, `active_users2d` json not null, `active_users7d` json not null, `active_users14d` json not null, `active_users30d` json not null, `active_users60d` json not null, `active_users90d` json not null) default character set utf8mb4 engine = InnoDB;');
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists `activity_stats_entity`;');
  }

}
