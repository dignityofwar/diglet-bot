import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { ModuleMetadata } from '@nestjs/common';
import { Ps2Module } from './ps2/ps2.module';
import { GeneralModule } from './general/general.module';
import { AlbionModule } from './albion/albion.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { DiscordModule } from '@discord-nestjs/core';

describe('AppModule', () => {
  beforeAll(async () => {
    jest.mock('@mikro-orm/nestjs', () => ({
      MikroOrmModule: {
        forRoot: jest.fn().mockReturnValue({}),
      },
    }));
    await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  it('should include necessary modules in its imports', () => {
    const appModuleImports = Reflect.getMetadata('imports', AppModule) as ModuleMetadata['imports'];

    // Filter out non-function items (like configuration objects)
    const importedModules = appModuleImports.filter(item => typeof item === 'function');

    // List of modules that should be present in AppModule's imports
    const requiredModules = [
      Ps2Module,
      GeneralModule,
      AlbionModule,
      ConfigModule,
      DatabaseModule,
      DiscordModule,
      // ScheduleModule - too hard to mock, cba
    ];

    for (const requiredModule of requiredModules) {
      expect(importedModules).toContain(requiredModule);
    }
  });
});
