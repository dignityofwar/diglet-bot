import { Migration } from "@mikro-orm/migrations";

export class Migration20250404223706 extends Migration {
  override async up(): Promise<void> {
    this.addSql("alter table `joiner_leaver_entity` drop column `rejoined`;");
  }

  override async down(): Promise<void> {
    this.addSql(
      "alter table `joiner_leaver_entity` add `rejoined` tinyint(1) not null default false;",
    );
  }
}
