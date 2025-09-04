import { Migration } from "@mikro-orm/migrations";

export class Migration20240423214035 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      "UPDATE `albion_registrations_entity` SET `guild_id` = 'btPZRoLvTUqLC7URnDRgSQ' WHERE `created_at` <= '2024-04-24 18:53:25';",
    );
  }

  async down(): Promise<void> {
    this.addSql(
      "UPDATE `albion_registrations_entity` SET `guild_id` = NULL WHERE `created_at` <= '2024-04-24 18:53:25';",
    );
  }
}
