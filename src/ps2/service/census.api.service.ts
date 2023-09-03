import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import CensusAxiosFactory from '../factories/census.axios.factory';
import {
  CensusCharacterResponseInterface,
  CensusCharacterWithOutfitInterface,
} from '../interfaces/CensusCharacterResponseInterface';
import { ConfigService } from '@nestjs/config';
import { CensusOutfitInterface, CensusOutfitResponseInterface } from '../interfaces/CensusOutfitResponseInterface';

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
    tries = tries + 1;

    try {
      const response = await request.get(url);

      if (response.data.error) {
        // noinspection ExceptionCaughtLocallyJS
        throw new Error(`Census responded with an error: ${response.data.error}`);
      }

      return response.data;
    }
    catch (err) {
      if (tries === CensusApiService.RETRY_ATTEMPTS) {
        throw new Error(`Failed to perform request to Census after ${CensusApiService.RETRY_ATTEMPTS} retries. Final error: ${err.message}`);
      }

      this.logger.warn(`Request failed (attempt ${tries}/${CensusApiService.RETRY_ATTEMPTS}). Retrying in ${CensusApiService.RETRY_DELAY_MS} ms...`);

      await new Promise(resolve => setTimeout(resolve, CensusApiService.RETRY_DELAY_MS));
      return this.requestWithRetries(url, tries);
    }
  }

  async getCharacter(characterName: string): Promise<CensusCharacterWithOutfitInterface> {
    const url = `character?name.first_lower=${characterName.toLowerCase()}&c:join=outfit_member^inject_at:outfit_info`;
    const response: CensusCharacterResponseInterface = await this.requestWithRetries(url);

    if (response.returned === 0 || !response.character_list || response.character_list.length === 0) {
      throw new Error(`Character \`${characterName}\` does not exist. Please ensure you have spelt it correctly.`);
    }

    return response.character_list[0];
  }

  async getCharacterById(characterId: string): Promise<CensusCharacterWithOutfitInterface | null> {
    const url = `character?character_id=${characterId}&c:join=outfit_member^inject_at:outfit_info`;
    const response: CensusCharacterResponseInterface = await this.requestWithRetries(url);

    if (response.returned === 0 || !response.character_list || response.character_list.length === 0) {
      throw new Error(`Character with ID **${characterId}** does not exist.`);
    }

    return response.character_list[0];
  }

  async getOutfit(outfitId: string): Promise<CensusOutfitInterface | null> {
    const url = `outfit/${this.config.get('app.ps2.outfitId')}?c:resolve=rank`;

    const response: CensusOutfitResponseInterface = await this.requestWithRetries(url);

    if (response.returned === 0 || !response.outfit_list || response.outfit_list.length === 0) {
      throw new Error(`Outfit with ID **${outfitId}** does not exist.`);
    }

    return response.outfit_list[0];
  }
}
