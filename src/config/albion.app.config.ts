export interface AlbionRoleMapInterface {
  name: string;
  discordRoleId: string;
  priority: number;
  keep: boolean;
}

const rolesToRankProduction: AlbionRoleMapInterface[] = [
  {
    name: "@ALB/Archmage",
    discordRoleId: "1218115619732455474",
    priority: 1,
    keep: true,
  },
  {
    name: "@ALB/Magister",
    discordRoleId: "1218115569455464498",
    priority: 2,
    keep: false,
  },
  {
    name: "@ALB/Warcaster",
    discordRoleId: "1218115480426905641",
    priority: 3,
    keep: false,
  },
  {
    name: "@ALB/Adept",
    discordRoleId: "1218115422029873153",
    priority: 4,
    keep: false,
  },
  {
    name: "@ALB/Graduate",
    discordRoleId: "1218115340009996339",
    priority: 5,
    keep: true,
  },
  {
    name: "@ALB/Disciple",
    discordRoleId: "1218115269419995166",
    priority: 6,
    keep: false,
  },
  {
    name: "@ALB/Registered",
    discordRoleId: "1224609941260603402",
    priority: 7,
    keep: true,
  },
];
const rolesToRankDevelopment: AlbionRoleMapInterface[] = [
  {
    name: "@ALB/Archmage",
    discordRoleId: "1232802066414571631",
    priority: 1,
    keep: true,
  },
  {
    name: "@ALB/Magister",
    discordRoleId: "1232802105564205126",
    priority: 2,
    keep: false,
  },
  {
    name: "@ALB/Warcaster",
    discordRoleId: "1232802165861384305",
    priority: 3,
    keep: false,
  },
  {
    name: "@ALB/Adept",
    discordRoleId: "1232802244219637893",
    priority: 4,
    keep: false,
  },
  {
    name: "@ALB/Graduate",
    discordRoleId: "1232802285734727772",
    priority: 5,
    keep: true,
  },
  {
    name: "@ALB/Disciple",
    discordRoleId: "1232802355733336196",
    priority: 6,
    keep: false,
  },
  {
    name: "@ALB/Registered",
    discordRoleId: "1232778554320879811",
    priority: 7,
    keep: true,
  },
];
const roleMap =
  process.env.ENVIRONMENT === "production"
    ? rolesToRankProduction
    : rolesToRankDevelopment;
const findRole = (roleName: string) =>
  roleMap.filter((role) => role.name === roleName)[0];
const pingLeaderRoles = [
  findRole("@ALB/Archmage").discordRoleId,
  findRole("@ALB/Magister").discordRoleId,
];

export default () => ({
  guildId: "0_zTfLfASD2Wtw6Tc-yckA",
  roleMap,
  pingLeaderRoles,
  scanExcludedUsers: [], // Discord IDs
  guildLeaderRole: findRole("@ALB/Archmage"),
  guildOfficerRole: findRole("@ALB/Magister"),
});
