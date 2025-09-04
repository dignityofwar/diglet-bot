import { Migration } from "@mikro-orm/migrations";

export class Migration20250404232510 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      "create table `joiner_leaver_statistics_entity` (`id` int unsigned not null auto_increment primary key, `created_at` datetime not null, `updated_at` datetime not null, `joiners` int not null default 0, `leavers` int not null default 0, `rejoiners` int not null default 0, `early_leavers` int not null default 0, `avg_time_to_leave` varchar(255) not null default '0d 0h 0m') default character set utf8mb4 engine = InnoDB;",
    );
  }

  override async down(): Promise<void> {
    this.addSql("drop table if exists `joiner_leaver_statistics_entity`;");
  }
}
