# diglet-bot

diglet-bot is a TypeScript Discord bot using NestJS framework that serves the Dignity of War community. It supports Albion Online and PlanetSide 2 game integrations with comprehensive member management, verification systems, and automated reporting.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### System Requirements
- Download Node.js 22.14.0: `curl -fsSL https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.xz -o /tmp/node-v22.14.0-linux-x64.tar.xz`
- Extract Node.js: `cd /tmp && tar -xf node-v22.14.0-linux-x64.tar.xz`
- Set PATH: `export PATH=/tmp/node-v22.14.0-linux-x64/bin:$PATH`
- Install pnpm: `npm install -g pnpm@9.14.4`
- Verify versions: `node --version` (should be v22.14.0) and `pnpm --version` (should be 9.14.4)

### Bootstrap, Build, and Test
- `pnpm install` -- takes ~26 seconds. Dependencies installation.
- `cp .env.example .env` -- create environment configuration file.
- `docker compose up -d` -- start MariaDB database (~4 seconds for initial pull, <1 second afterwards).
- `pnpm build` -- takes ~6 seconds. NEVER CANCEL. Set timeout to 30+ seconds for safety.
- `pnpm migration:up` -- run database migrations, takes ~6 seconds. NEVER CANCEL. Set timeout to 30+ seconds.
- `pnpm test` -- takes ~108 seconds (1 min 48 sec). NEVER CANCEL. Set timeout to 180+ seconds.
- `pnpm test:ci` -- takes ~100 seconds (1 min 40 sec). NEVER CANCEL. Set timeout to 180+ seconds.
- `pnpm test:wsl` -- WSL compatibility version, takes ~104 seconds. NEVER CANCEL. Set timeout to 180+ seconds.

### Development Workflow
- Start development mode: `pnpm dev` -- starts NestJS in watch mode with hot reloading.
- Stop database: `./stop.sh` -- stops Docker containers (~0.4 seconds).
- Full start script: `./start.sh` -- runs complete startup sequence including database, build, migrations, and dev mode.

### Code Quality
- Run linter: `pnpm lint` -- takes ~6 seconds. Fixes issues automatically.
- Run formatter: `pnpm format` -- takes ~2 seconds. Formats all TypeScript files.
- **CRITICAL**: Add `provisioning` to `.eslintignore` if linting fails with permission errors on database files.

## Validation

### Application Testing
- ALWAYS run the complete bootstrap sequence when setting up or making changes.
- The bot connects to Discord (requires valid TOKEN in .env) and MariaDB database.
- Test the development startup: application should start successfully and show Discord command registration.
- **NEVER CANCEL long-running commands** - builds may take 6+ seconds, tests may take 108+ seconds.
- Use WSL-specific commands (`pnpm test:wsl`) on Windows Subsystem for Linux to avoid filesystem issues.

### Database Configuration Notes
- Default .env uses `DB_HOST=digletbot-db` for Docker internal networking.
- On WSL or direct connections, change to `DB_HOST=127.0.0.1`.
- Database runs on port 3306 with credentials: root/password.
- Migration failures typically require building first: `pnpm build` then `pnpm migration:up`.

### CI/CD Integration
- Always run `pnpm lint` and `pnpm format` before committing to pass CI checks.
- GitHub Actions workflow requires Node.js 22.18.0 and pnpm 9.15.9.
- SonarCloud integration for code quality metrics.
- Coverage reports generated in `coverage/` directory.

## Common Tasks

### Project Structure
```
src/
├── albion/          # Albion Online integration
├── ps2/             # PlanetSide 2 integration  
├── general/         # Core Discord bot functionality
├── database/        # MikroORM entities and migrations
├── config/          # Configuration modules
└── discord/         # Discord.js integration
```

### Key Technologies
- **Framework**: NestJS with dependency injection
- **Discord**: discord.js v14 with @discord-nestjs/core
- **Database**: MikroORM with MariaDB
- **Testing**: Jest with 76.13% coverage
- **Linting**: ESLint with TypeScript rules
- **Formatting**: Prettier

### Frequently Referenced Files
- `package.json` -- dependency and script definitions
- `mikro-orm.config.ts` -- database configuration
- `.env.example` -- environment variables template
- `jest.config.js` -- test configuration
- `src/app.module.ts` -- main application module
- `src/main.ts` -- application entry point

### Command Reference
- Migration commands: `migration:create`, `migration:up`, `migration:down`, `migration:list`
- Start commands: `start`, `start:dev`, `start:debug`, `start:prod`
- Test commands: `test`, `test:watch`, `test:debug`, `test:ci`, `test:wsl`
- Build commands: `build`, `dev` (watch mode)

### WSL Compatibility Notes
- Use `npm install` instead of `pnpm install` if symlink issues occur.
- Set `DB_HOST=127.0.0.1` in `.env` for database connectivity.
- Use `pnpm test:wsl` with limited workers to avoid filesystem performance issues.
- Consider reducing maxWorkers to 1-2 if tests still cause filesystem problems.

### Environment Variables
Key variables in `.env`:
- `TOKEN` -- Discord bot token (required for bot functionality)
- `GUILD_ID_WITH_COMMANDS` -- Discord server ID for slash commands
- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` -- database connection
- `PS2_CENSUS_SERVICE_ID` -- PlanetSide 2 API service ID
- Various Discord channel and role IDs for different game integrations

### Troubleshooting
- **Migration failures**: Run `pnpm build` first to compile TypeScript for MikroORM CLI.
- **Linting permission errors**: Add `provisioning` to `.eslintignore`.
- **Database connection issues**: Check Docker container status and DB_HOST setting.
- **Test performance on WSL**: Use `pnpm test:wsl` with reduced worker count.
- **Docker issues**: Ensure Docker daemon is running with `docker info`.