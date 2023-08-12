import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Config } from './entities/config.entity';
import { Repository } from 'typeorm';

@Injectable()
export class DatabaseService {
  @InjectRepository(Config)
  private configRepository: Repository<Config>;

  async getConfigItem(key: string): Promise<string> {
    const record = await this.configRepository.findOneByOrFail({ key: key });

    if (!record.value) {
      throw new Error('Config item not found!');
    }
    return record.value;
  }

}
