import { Injectable } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';

@Injectable()
export class DatabaseService {
  constructor(
    private readonly orm: MikroORM,
  ) {}

  async save<T>(entity: T): Promise<T> {
    await this.orm.em.persistAndFlush(entity);
    return entity;
  }
}
