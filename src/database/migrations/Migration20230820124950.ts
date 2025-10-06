import { Migration } from "@mikro-orm/migrations";

export class Migration20230820124950 extends Migration {
  async up(): Promise<void> {
    this.addSql("alter table `ps2members_entity` drop `discord_name`;");
  }

  async down(): Promise<void> {
    this.addSql(
      "alter table `ps2members_entity` add `discord_name` varchar(255) not null;",
    );
  }
}
