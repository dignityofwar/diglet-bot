import { Migration } from '@mikro-orm/migrations';

export class Migration20250408215641 extends Migration {

  override async up(): Promise<void> {
    this.addSql('create table `role_metrics_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `onboarded` int not null default 0, `community_games` json null, `rec_games` json null) default character set utf8mb4 engine = InnoDB;');
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists `role_metrics_entity`;');
  }

}
