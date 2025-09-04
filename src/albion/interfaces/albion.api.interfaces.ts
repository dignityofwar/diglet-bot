// eslint-disable-next-line no-shadow
export enum AlbionServer {
  EUROPE = "Europe",
}

// eslint-disable-next-line no-shadow
export enum AlbionApiEndpoint {
  ALBION_EUROPE = "https://gameinfo-ams.albiononline.com/api/gameinfo",
}

// Seemingly this interface appears to always return null
interface AlbionEquipmentInterface {
  MainHand: string | null;
  OffHand: string | null;
  Head: string | null;
  Armor: string | null;
  Shoes: string | null;
  Bag: string | null;
  Cape: string | null;
  Mount: string | null;
  Potion: string | null;
  Food: string | null;
}

interface AlbionAreaStatisticsInterface {
  Total: number;
  Royal: number;
  Outlands: number;
  Avalon: number;
}

interface AlbionStatisticsInterface extends AlbionAreaStatisticsInterface {
  Hellgate: number;
  CorruptedDungeon: number;
  Mists: number;
}

interface AlbionPlayerDetailsInterface {
  Id: string;
  Name: string;
  GuildId: string;
  GuildName: string | null;
  AllianceName: string; // Weirdly not null if it's empty, yay consistency
  AllianceId: string;
  AllianceTag: string;
  Avatar: string;
  AvatarRing: string;
  DeathFame: number;
  KillFame: number;
  FameRatio: number;
}

interface AlbionSearchPlayerInterface extends AlbionPlayerDetailsInterface {
  totalKills: null;
  gvgKills: null;
  gvgWon: null;
}

interface AlbionSearchGuildInterface {
  Id: string;
  Name: string;
  AllianceId: string;
  AllianceName: string;
  KillFame: null; // Seems to always be null
  DeathFame: number;
}

export interface AlbionPlayerInterface extends AlbionPlayerDetailsInterface {
  AverageItemPower: number; // Always seems to return 0
  Equipment: AlbionEquipmentInterface;
  Inventory: [];
  LifetimeStatistics: {
    PvE: AlbionStatisticsInterface;
    Gathering: {
      Fiber: AlbionAreaStatisticsInterface;
      Hide: AlbionAreaStatisticsInterface;
      Ore: AlbionAreaStatisticsInterface;
      Rock: AlbionAreaStatisticsInterface;
      Wood: AlbionAreaStatisticsInterface;
      All: AlbionAreaStatisticsInterface;
    };
    Crafting: AlbionAreaStatisticsInterface;
    CrystalLeague: number;
    FishingFame: number;
    FarmingFame: number;
    Timestamp: string;
  };
}

export interface AlbionPlayersResponseInterface {
  data: AlbionPlayerInterface;
}

export interface AlbionSearchResponseInterface {
  data: {
    guilds: AlbionSearchGuildInterface[];
    players: AlbionSearchPlayerInterface[];
  };
}
