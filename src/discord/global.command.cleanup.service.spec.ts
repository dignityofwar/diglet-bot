import { Test, TestingModule } from '@nestjs/testing';
import { Client, Collection } from 'discord.js';
import { Logger } from '@nestjs/common';
import { NECORD_MODULE_OPTIONS, NecordModuleOptions } from 'necord';
import { GlobalCommandCleanupService } from './global.command.cleanup.service';

describe('GlobalCommandCleanupService', () => {
  let service: GlobalCommandCleanupService;
  let necordOptions: NecordModuleOptions;
  let fetch: jest.Mock;
  let set: jest.Mock;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  const globalCommands = (...names: string[]) => {
    const collection = new Collection<string, { name: string }>();
    names.forEach((name, index) => collection.set(String(index), { name }));
    return collection;
  };

  beforeEach(async () => {
    fetch = jest.fn().mockResolvedValue(globalCommands());
    set = jest.fn().mockResolvedValue(undefined);
    necordOptions = { token: 'token', intents: [], development: ['1234'] };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GlobalCommandCleanupService,
        {
          provide: Client,
          useValue: { application: { commands: { fetch, set } } },
        },
        {
          provide: NECORD_MODULE_OPTIONS,
          useValue: necordOptions,
        },
      ],
    }).compile();

    service = module.get<GlobalCommandCleanupService>(GlobalCommandCleanupService);

    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('clears the global scope when stale commands are present', async () => {
    fetch.mockResolvedValue(globalCommands('albion-register', 'ping'));

    await service.onClientReady();

    expect(set).toHaveBeenCalledWith([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('albion-register, ping'));
  });

  it('does nothing when the global scope is already empty', async () => {
    await service.onClientReady();

    expect(set).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('does nothing when necord is not scoping commands to a guild', async () => {
    necordOptions.development = false;

    await service.onClientReady();

    expect(fetch).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('does nothing when necord is given an empty guild list', async () => {
    necordOptions.development = [];

    await service.onClientReady();

    expect(fetch).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('logs rather than throwing when the fetch fails', async () => {
    fetch.mockRejectedValue(new Error('Missing Access'));

    await expect(service.onClientReady()).resolves.toBeUndefined();

    expect(set).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Missing Access'), expect.any(Error));
  });

  it('logs rather than throwing when the overwrite fails', async () => {
    fetch.mockResolvedValue(globalCommands('albion-register'));
    set.mockRejectedValue(new Error('Rate limited'));

    await expect(service.onClientReady()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(expect.stringContaining('Rate limited'), expect.any(Error));
    expect(warn).not.toHaveBeenCalled();
  });
});
