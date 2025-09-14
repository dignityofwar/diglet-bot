import { Migration } from "@mikro-orm/migrations";

export class Migration20250403215024 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      "create table `activity_statistics_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `total_users` int not null default 0, `inactive_users` int not null default 0, `active_users90d` int not null default 0, `active_users60d` int not null default 0, `active_users30d` int not null default 0, `active_users14d` int not null default 0, `active_users7d` int not null default 0, `active_users3d` int not null default 0, `active_users2d` int not null default 0, `active_users1d` int not null default 0) default character set utf8mb4 engine = InnoDB;",
    );
  }

  async down(): Promise<void> {
    this.addSql("drop table if exists `activity_statistics_entity`;");
  }
}
