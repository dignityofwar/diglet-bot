import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { writeFile } from 'fs/promises';
import { HealthcheckService, HEARTBEAT_PATH } from './healthcheck.service';

jest.mock('fs/promises', () => ({ writeFile: jest.fn() }));

const mockWriteFile = writeFile as jest.Mock;

describe('HealthcheckService', () => {
  let healthcheckService: HealthcheckService;
  let configService: ConfigService;

  const configure = (env: string, uuid?: string) => {
    jest.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'app.environment') return env;
      if (key === 'app.healthcheckUUID') return uuid;
      return undefined;
    });
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthcheckService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    healthcheckService = module.get<HealthcheckService>(HealthcheckService);
    configService = module.get<ConfigService>(ConfigService);

    mockWriteFile.mockReset().mockResolvedValue(undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  // The heartbeat is what the container HEALTHCHECK reads, so it has to be
  // written on every tick regardless of environment — otherwise a non-production
  // container reports unhealthy forever.
  it('writes the heartbeat file outside production', async () => {
    configure('development');

    await healthcheckService.check();

    expect(mockWriteFile).toHaveBeenCalledWith(HEARTBEAT_PATH, expect.any(String));
  });

  it('writes the heartbeat file in production', async () => {
    configure('production', 'some-uuid');
    jest.spyOn(axios, 'create').mockReturnValue({ get: jest.fn() } as never);

    await healthcheckService.check();

    expect(mockWriteFile).toHaveBeenCalledWith(HEARTBEAT_PATH, expect.any(String));
  });

  // Ordering matters: the heartbeat is written before the uptime ping, so an
  // outage at hc-ping.com cannot make the container look unhealthy.
  it('still writes the heartbeat when the uptime ping fails', async () => {
    configure('production', 'some-uuid');
    const get = jest.fn().mockRejectedValue(new Error('hc-ping is down'));
    jest.spyOn(axios, 'create').mockReturnValue({ get } as never);

    await expect(healthcheckService.check()).rejects.toThrow('hc-ping is down');

    expect(mockWriteFile).toHaveBeenCalledWith(HEARTBEAT_PATH, expect.any(String));
  });

  // And the reverse: a read-only /tmp must not take out the uptime ping.
  it('still pings when the heartbeat cannot be written', async () => {
    configure('production', 'some-uuid');
    mockWriteFile.mockRejectedValue(new Error('read-only file system'));
    const get = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(axios, 'create').mockReturnValue({ get } as never);

    await healthcheckService.check();

    expect(get).toHaveBeenCalledWith('some-uuid');
  });

  it('does not ping outside production', async () => {
    configure('development');
    const create = jest.spyOn(axios, 'create');

    await healthcheckService.check();

    expect(create).not.toHaveBeenCalled();
  });

  it('does not ping when no UUID is configured', async () => {
    configure('production', undefined);
    const create = jest.spyOn(axios, 'create');

    await healthcheckService.check();

    expect(create).not.toHaveBeenCalled();
  });
});
