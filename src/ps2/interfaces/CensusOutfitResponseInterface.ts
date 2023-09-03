export interface CensusOutfitResponseInterface {
  outfit_list: CensusOutfitInterface[]
  returned: number
}

export interface CensusOutfitInterface {
  outfit_id: string;
  name: string;
  name_lower: string;
  alias: string;
  alias_lower: string;
  time_created: string;
  time_created_date: string;
  leader_character_id: string;
  member_count: string;
  ranks: RanksInterface[];
}

export interface RanksInterface {
  ordinal: string;
  name: string;
  description: string; // Uncontrolable by the outfit leaders
}
