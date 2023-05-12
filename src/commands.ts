import { CommandInterface } from './interfaces/CommandInterface';
import { PingCommand } from './commands/PingCommand';
import { RegisterCommand } from './commands/albion/RegisterCommand';

export const Commands: CommandInterface[] = [PingCommand, RegisterCommand];
