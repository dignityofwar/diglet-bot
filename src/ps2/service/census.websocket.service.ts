import { Injectable, OnModuleInit, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CensusCharacterWithOutfitInterface } from '../interfaces/CensusCharacterResponseInterface';
import { CensusClient } from 'ps2census';
import { EventSubscription } from 'ps2census/dist/types/client/types';
import { EventConstants } from '../constants/EventConstants';
import EventEmitter from 'events';

@Injectable()
export class CensusWebsocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CensusWebsocketService.name);
  private client: CensusClient;
  private monitoringCharacters: CensusCharacterWithOutfitInterface[] = [];
  private subscription: EventSubscription = {
    characters: this.monitoringCharacters.map((character) => character.character_id),
    worlds: ['10'],
    eventNames: ['Death'],
    logicalAndCharactersWithWorlds: true,
  };

  constructor(
    private readonly config: ConfigService,
    private readonly eventBus: EventEmitter
  ) {}

  onModuleInit() {
    this.eventBus.on('ps2.verification.service.ready', () => this.subscribe());
  }
  onModuleDestroy() {
    this.client.destroy();
  }

  private subscribe() {
    // Connect to the external WebSocket service.
    const client = new CensusClient(this.config.get('ps2.censusServiceId'), 'ps2', {
      streamManager: {
        subscription: this.subscription,
        endpoint: 'wss://push.nanite-systems.net/streaming',
      },
    });

    client.on('subscribed', () => {
      this.logger.log('Subscribed to NS ESS WebSocket service!');
      this.logger.debug(JSON.stringify(this.subscription));
      this.eventBus.emit(EventConstants.PS2_CENSUS_SUBSCRIBED, {});
    });
    client.on('death', (event) => this.eventBus.emit(EventConstants.PS2_CENSUS_DEATH, event));
    client.on('error', error => {
      this.logger.warn(error);
    });
    client.on('error', error => {
      this.logger.error(error);
    });
    client.watch();

    this.client = client;
  }

  public watchCharacter(characterToWatch: CensusCharacterWithOutfitInterface) {
    this.monitoringCharacters.push(characterToWatch);
    this.subscription.characters = this.monitoringCharacters.map((character) => character.character_id);
    this.subscribe();
  }

  public unwatchCharacter(characterToUnwatch: CensusCharacterWithOutfitInterface) {
    this.monitoringCharacters = this.monitoringCharacters.filter((character) => character.character_id !== characterToUnwatch.character_id);
    this.subscription.characters = this.monitoringCharacters.map((character) => character.character_id);
    this.subscribe();
  }
}
