import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import CensusAxiosFactory from '../factories/census.axios.factory';
import {
  CensusCharacterResponseInterface,
  CensusCharacterWithOutfitInterface,
} from '../interfaces/CensusCharacterResponseInterface';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CensusApiService implements OnModuleInit {
  private readonly logger = new Logger(CensusApiService.name);
  private static readonly RETRY_ATTEMPTS = 3;
  private static readonly RETRY_DELAY_MS = 1000;

  constructor(
    private readonly censusClientFactory: CensusAxiosFactory,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(character = 'Maelstrome26') {
    // Check if our service ID is valid
    if (!this.config.get('app.ps2.censusServiceId')) {
      throw new Error('PS2_CENSUS_SERVICE_ID is not defined.');
    }

    // Check if our service key is valid by doing a request to Census via Axios
    this.logger.debug('Attempting to reach Census...');
    await this.getCharacter(character);
    this.logger.debug('Census responded!');
  }

  private async requestWithRetries<T>(url: string, tries = 0): Promise<T> {
    const request = this.censusClientFactory.createClient();

    try {
      const response = await request.get(url);

      if (response.data.error) {
        // noinspection ExceptionCaughtLocallyJS
        throw new Error(`Census responded with an error: ${response.data.error}`);
      }

      return response.data;
    }
    catch (err) {
      if (tries === 3) {
        throw new Error(`Failed to perform request to Census after multiple retries. Final error: ${err.message}`);
      }

      this.logger.warn(`Request failed (attempt ${tries + 1}/${CensusApiService.RETRY_ATTEMPTS}). Retrying in ${CensusApiService.RETRY_DELAY_MS} ms...`);

      await new Promise(resolve => setTimeout(resolve, CensusApiService.RETRY_DELAY_MS));
      return this.requestWithRetries(url, tries + 1);
    }
  }

  async getCharacter(characterName: string): Promise<CensusCharacterWithOutfitInterface> {
    const url = `character?name.first_lower=${characterName.toLowerCase()}&c:join=outfit_member^on:character_id^to:character_id^inject_at:outfit_info&c:join=outfit^on:outfit_id^to:outfit_id^inject_at:outfit_details`;
    const response: CensusCharacterResponseInterface = await this.requestWithRetries(url);

    if (response.returned === 0 || !response.character_list || response.character_list.length === 0) {
      throw new Error(`Character **${characterName}** does not exist.`);
    }

    return response.character_list[0];
  }

  async getCharacterById(characterId: string): Promise<CensusCharacterWithOutfitInterface | null> {
    const url = `character?character_id=${characterId}&c:join=outfit_member^on:character_id^to:character_id^inject_at:outfit_info&c:join=outfit^on:outfit_id^to:outfit_id^inject_at:outfit_details`;
    const response: CensusCharacterResponseInterface = await this.requestWithRetries(url);

    if (response.returned === 0 || !response.character_list || response.character_list.length === 0) {
      throw new Error(`Character with ID **${characterId}** does not exist.`);
    }

    return response.character_list[0];
  }
}
