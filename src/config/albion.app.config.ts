import { AlbionServer } from '../albion/interfaces/albion.api.interfaces';

export interface AlbionRoleMapInterface {
  name: string,
  discordRoleId: string;
  priority: number;
  keep: boolean
  server: AlbionServer
}

const rolesToRankProduction: AlbionRoleMapInterface[] = [
  {
    name: '@ALB/US/Guildmaster',
    discordRoleId: '1039565956885786784',
    priority: 1,
    keep: true,
    server: AlbionServer.AMERICAS,
  },
  {
    name: '@ALB/EU/Archmage',
    discordRoleId: '1218115619732455474',
    priority: 1,
    keep: true,
    server: AlbionServer.EUROPE,
  },
  {
    name: '@ALB/US/Master',
    discordRoleId: '1039566101593456694',
    priority: 2,
    keep: false,
    server: AlbionServer.AMERICAS,
  },
  {
    name: '@ALB/EU/Magister',
    discordRoleId: '1218115569455464498',
    priority: 2,
    keep: false,
    server: AlbionServer.EUROPE,
  },
  {
    name: '@ALB/US/General',
    discordRoleId: '1039565571970310276',
    priority: 3,
    keep: false,
    server: AlbionServer.AMERICAS,
  },
  {
    name: '@ALB/EU/Warcaster',
    discordRoleId: '1218115480426905641',
    priority: 3,
    keep: false,
    server: AlbionServer.EUROPE,
  },
  {
    name: '@ALB/US/Captain',
    discordRoleId: '1039565777650581575',
    priority: 4,
    keep: false,
    server: AlbionServer.AMERICAS,
  },
  {
    name: '@ALB/EU/Adept',
    discordRoleId: '1218115422029873153',
    priority: 4,
    keep: false,
    server: AlbionServer.EUROPE,
  },
  {
    name: '@ALB/US/Squire',
    discordRoleId: '1039565554563960852',
    priority: 5,
    keep: true,
    server: AlbionServer.AMERICAS,
  },
  {
    name: '@ALB/EU/Graduate',
    discordRoleId: '1218115340009996339',
    priority: 5,
    keep: true,
    server: AlbionServer.EUROPE,
  },
  {
    name: '@ALB/US/Initiate',
    discordRoleId: '1076193105868501112',
    priority: 6,
    keep: false,
    server: AlbionServer.AMERICAS,
  },
  {
    name: '@ALB/EU/Disciple',
    discordRoleId: '1218115269419995166',
    priority: 6,
    keep: false,
    server: AlbionServer.EUROPE,
  },
  {
    name: '@ALB/US/Registered',
    discordRoleId: '1155987035472023702',
    priority: 6,
    keep: true,
    server: AlbionServer.AMERICAS,
  },
  {
    name: '@ALB/EU/Registered',
    discordRoleId: '1224609941260603402',
    priority: 6,
    keep: true,
    server: AlbionServer.EUROPE,
  },
];
const rolesToRankDevelopment: AlbionRoleMapInterface[] = [
  {
    name: '@ALB/US/Guildmaster',
    discordRoleId: '1158467537550454895',
    priority: 1,
    keep: true,
    server: AlbionServer.AMERICAS,
  },
  {
    name: '@ALB/EU/Archmage',
    discordRoleId: '1232802066414571631',
    priority: 1,
    keep: true,
    server: AlbionServer.EUROPE,
  },
  {
    name: '@ALB/US/Master',
    discordRoleId: '1158467574678429696',
    priority: 2,
    keep: false,
    server: AlbionServer.AMERICAS,
  },
  {
    name: '@ALB/EU/Magister',
    discordRoleId: '1232802105564205126',
    priority: 2,
    keep: false,
    server: AlbionServer.EUROPE,
  },
  {
    name: '@ALB/US/General',
    discordRoleId: '1158467600687300699',
    priority: 3,
    keep: false,
    server: AlbionServer.AMERICAS,
  },
  {
    name: '@ALB/EU/Warcaster',
    discordRoleId: '1232802165861384305',
    priority: 3,
    keep: false,
    server: AlbionServer.EUROPE,
  },
  {
    name: '@ALB/US/Captain',
    discordRoleId: '1158467651165761626',
    priority: 4,
    keep: false,
    server: AlbionServer.AMERICAS,
  },
  {
    name: '@ALB/EU/Adept',
    discordRoleId: '1232802244219637893',
    priority: 4,
    keep: false,
    server: AlbionServer.EUROPE,
  },
  {
    name: '@ALB/US/Squire',
    discordRoleId: '1158467840496635914',
    priority: 5,
    keep: true,
    server: AlbionServer.AMERICAS,
  },
  {
    name: '@ALB/EU/Graduate',
    discordRoleId: '1232802285734727772',
    priority: 5,
    keep: true,
    server: AlbionServer.EUROPE,
  },
  {
    name: '@ALB/US/Initiate',
    discordRoleId: '1139909152701947944',
    priority: 6,
    keep: false,
    server: AlbionServer.AMERICAS,
  },
  {
    name: '@ALB/EU/Disciple',
    discordRoleId: '1232802355733336196',
    priority: 6,
    keep: false,
    server: AlbionServer.EUROPE,
  },
  {
    name: '@ALB/US/Registered',
    discordRoleId: '1155987100928323594',
    priority: 6,
    keep: true,
    server: AlbionServer.AMERICAS,
  },
  {
    name: '@ALB/EU/Registered',
    discordRoleId: '1232778554320879811',
    priority: 6,
    keep: true,
    server: AlbionServer.EUROPE,
  },
];
const roleMap = process.env.ENVIRONMENT === 'production' ? rolesToRankProduction : rolesToRankDevelopment as AlbionRoleMapInterface[];
const findRole = (roleName: string) => roleMap.filter((role) => role.name === roleName)[0];
const pingLeaderRolesUS = [findRole('@ALB/US/Guildmaster').discordRoleId, findRole('@ALB/US/Master').discordRoleId];
const pingLeaderRolesEU = [findRole('@ALB/EU/Archmage').discordRoleId, findRole('@ALB/EU/Magister').discordRoleId];

export default () => ({
  guildIdUS: 'btPZRoLvTUqLC7URnDRgSQ',
  guildIdEU: '0_zTfLfASD2Wtw6Tc-yckA',
  roleMap,
  pingLeaderRolesUS,
  pingLeaderRolesEU,
  scanExcludedUsers: [], // Discord IDs
  guildLeaderRoleUS: findRole('@ALB/US/Guildmaster'),
  guildLeaderRoleEU: findRole('@ALB/EU/Archmage'),
  guildOfficerRoleUS: findRole('@ALB/US/Master'),
  guildOfficerRoleEU: findRole('@ALB/EU/Magister'),
});
