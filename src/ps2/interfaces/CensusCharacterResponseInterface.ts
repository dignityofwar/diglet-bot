export interface CensusCharacterWithOutfitInterface {
  character_id: string;
  name: {
    first: string;
    first_lower: string;
  }
  faction_id: string;
  head_id: string;
  title_id: string;
  times: {
    creation: string;
    creation_date: string;
    last_save: string;
    last_save_date: string;
    last_login: string;
    last_login_date: string;
    login_count: string;
    minutes_played: string;
  }
  certs: {
    earned_points: string;
    gifted_points: string;
    spent_points: string;
    available_points: string;
    percent_to_next: string;
  }
  battle_rank: {
    percent_to_next: string;
    value: string;
  }
  profile_id: string;
  daily_ribbon: {
    count: string;
  }
  prestige_level: string;
  outfit_info: {
    outfit_id: string;
    character_id: string;
    member_since: string;
    member_since_date: string;
    rank: string;
    rank_ordinal: string;
  }
  monitoringStarted?: Date
}

export interface CensusCharacterResponseInterface {
  data: {
    character_list: CensusCharacterWithOutfitInterface[];
    returned: number;
  }
  error?: string
}
