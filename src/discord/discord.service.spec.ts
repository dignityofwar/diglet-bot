/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DiscordService } from './discord.service';
import { TestBootstrapper } from '../test.bootstrapper';
import { getChannel } from './discord.hacks';

describe('DiscordService', () => {
  let service: DiscordService;
  let mockDiscordClient: any;

  beforeEach(async () => {
    mockDiscordClient = TestBootstrapper.getMockDiscordClient();

    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscordService,
        ConfigService,
        {
          provide: '__inject_discord_client__',
          useValue: mockDiscordClient, // use mock instance
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);

    service = moduleRef.get<DiscordService>(DiscordService);

    jest.spyOn(service['logger'], 'error');
    jest.spyOn(service['logger'], 'warn');
    jest.spyOn(service['logger'], 'log');
    jest.spyOn(service['logger'], 'debug');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('getGuild', () => {
    it('should call get method of guilds.cache of discordClient with correct guildIdUS', async () => {
      const guildId = '123456789';
      const result = await service.getGuild(guildId);
      expect(result.id).toBe('123456789');
    });

    it('should throw an error when the request failed', async () => {
      const guildId = '343432353343';
      mockDiscordClient.guilds.cache.get = jest.fn().mockImplementation(() => {
        throw new Error('Discord says no');
      });
      await expect(service.getGuild(guildId)).rejects.toThrow(`Failed to fetch guild with ID ${guildId}. Err: Discord says no`);
    });

    it('should throw an error when the guild ID doesn\'t exist', async () => {
      const guildId = 'guildId123456';
      mockDiscordClient.guilds.cache.get = jest.fn().mockImplementation(() => undefined);
      await expect(service.getGuild(guildId)).rejects.toThrow(`Could not find guild with ID ${guildId}`);
    });
  });

  describe('getChannel', () => {
    it('should fetch the channel with correct id', async () => {
      const channelId = '45645674574567657567';
      const mockChannel = {}; // The expect returned channel data.
      mockDiscordClient.channels.fetch.mockResolvedValueOnce(mockChannel);

      const result = await service.getTextChannel(channelId);

      expect(result).toEqual(mockChannel);
      expect(mockDiscordClient.channels.fetch).toHaveBeenCalledWith(channelId);
    });

    it('should throw an error when the fetching attempt fails', async () => {
      const channelId = '567567567456345345465';
      const mockError = new Error('Channel not found');
      mockDiscordClient.channels.fetch.mockRejectedValueOnce(mockError);

      await expect(service.getTextChannel(channelId)).rejects.toThrow(`Failed to fetch channel with ID ${channelId}`);
      expect(mockDiscordClient.channels.fetch).toHaveBeenCalledWith(channelId);
    });
  });

  describe('getGuildMember', () => {
    it('should fetch the guild member with correct guild and member id', async () => {
      const guildId = '123456';
      const memberId = '64321';
      const mockMember = TestBootstrapper.getMockDiscordUser(); // The expected returned member data.

      const mockGuild = TestBootstrapper.getMockGuild(guildId);

      service.getGuild = jest.fn().mockResolvedValue(mockGuild);

      const result = await service.getGuildMember(guildId, memberId);

      expect(result.id).toEqual(mockMember.id);
      expect(result.displayName).toEqual(mockMember.displayName);
      expect(result.user.username).toEqual(mockMember.user.username);
      expect(service.getGuild).toHaveBeenCalledWith(guildId);
      expect(mockGuild.members.fetch).toHaveBeenCalledWith({ force: false, user: memberId });
    });

    it('should force fetch guild member', async () => {
      const guildId = '123456';
      const memberId = '64321';
      const mockMember = TestBootstrapper.getMockDiscordUser(); // The expected returned member data.

      const mockGuild = TestBootstrapper.getMockGuild(guildId);

      service.getGuild = jest.fn().mockResolvedValue(mockGuild);

      const result = await service.getGuildMember(guildId, memberId, true);

      expect(result.id).toEqual(mockMember.id);
      expect(result.displayName).toEqual(mockMember.displayName);
      expect(result.user.username).toEqual(mockMember.user.username);
      expect(service.getGuild).toHaveBeenCalledWith(guildId);
      expect(mockGuild.members.fetch).toHaveBeenCalledWith({ force: true, user: memberId });
    });

    it('should throw with a warning log when the member is blank', async () => {
      const guildId = '123456';
      const memberId = '64321';
      const mockGuild = TestBootstrapper.getMockGuild(guildId);
      mockGuild.members.fetch = jest.fn().mockImplementation(() => null);

      service.getGuild = jest.fn().mockResolvedValue(mockGuild);

      const errorMsg = `Could not find member with ID ${memberId}`;
      await expect(service.getGuildMember(guildId, memberId)).rejects.toThrow(errorMsg);
      expect(service['logger'].warn).toHaveBeenCalledWith(errorMsg);
      expect(service.getGuild).toHaveBeenCalledWith(guildId);
      expect(mockGuild.members.fetch).toHaveBeenCalledWith({ force: false, user: memberId });
    });

    it('should throw an error when Discord call errors', async () => {
      const guildId = '123456';
      const memberId = '64321';
      const mockGuild = TestBootstrapper.getMockGuild(guildId);
      mockGuild.members.fetch = jest.fn().mockImplementation(() => null);

      service.getGuild = jest.fn().mockResolvedValue(mockGuild);

      mockGuild.members.fetch = jest.fn().mockImplementation(() => {throw new Error('Discord went boom');});

      const errorMsg = `Failed to fetch member with ID ${memberId}. Err: Discord went boom`;
      await expect(service.getGuildMember(guildId, memberId)).rejects.toThrow(errorMsg);
      expect(service['logger'].error).toHaveBeenCalledWith(errorMsg, expect.any(Error));
      expect(service.getGuild).toHaveBeenCalledWith(guildId);
      expect(mockGuild.members.fetch).toHaveBeenCalledWith({ force: false, user: memberId });
    });
  });

  describe('getMemberRole', () => {
    it('should fetch the specified role for the guild member', async () => {
      const mockGuild = TestBootstrapper.getMockGuild('23454546464564');
      const guildMember = TestBootstrapper.getMockDiscordUser();
      const roleId = '67687989897867786';
      const mockRole = TestBootstrapper.getMockDiscordRole(roleId);

      // Mock the fetch implementation
      mockGuild.roles.fetch = jest.fn().mockResolvedValue(mockRole);

      // Mock the get method of guilds cache
      mockDiscordClient.guilds.cache.get = jest.fn().mockReturnValue(mockGuild);

      const result = await service.getRoleViaMember(guildMember, roleId);

      expect(result.id).toEqual(mockRole.id);
      expect(mockGuild.roles.fetch).toHaveBeenCalledWith(roleId);
    });

    it('should log an error and throw an exception when the fetch fails', async () => {
      const mockGuild = TestBootstrapper.getMockGuild('23454546464564');
      const guildMember = TestBootstrapper.getMockDiscordUser();
      const roleId = '34546576987976';
      const fetchError = new Error('Test error');
      mockGuild.roles.fetch = jest.fn().mockRejectedValueOnce(fetchError);

      // Mock the get method of guilds cache
      mockDiscordClient.guilds.cache.get = jest.fn().mockReturnValue(mockGuild);

      await expect(service.getRoleViaMember(guildMember, roleId)).rejects.toThrow(`Failed to fetch role with ID ${roleId}. Err: ${fetchError.message}`);
      expect(mockGuild.roles.fetch).toHaveBeenCalledWith(roleId);
    });

    it('should throw an exception if the role was not found', async () => {
      const mockGuild = TestBootstrapper.getMockGuild('23454546464564');
      const guildMember = TestBootstrapper.getMockDiscordUser();
      const roleId = '34546576987976';
      mockGuild.roles.fetch.mockResolvedValueOnce(null);

      // Mock the get method of guilds cache
      mockDiscordClient.guilds.cache.get = jest.fn().mockReturnValue(mockGuild);

      await expect(service.getRoleViaMember(guildMember, roleId)).rejects.toThrow(`Could not find role with ID ${roleId}`);
      expect(mockGuild.roles.fetch).toHaveBeenCalledWith(roleId);
    });
  });

  describe('kickMember', () => {
    it('should kick the guild member when requested', async () => {
      const guildMember = TestBootstrapper.getMockDiscordUser();
      const message = TestBootstrapper.getMockDiscordMessage();
      const reason = 'Test reason';

      guildMember.kick = jest.fn().mockResolvedValue(guildMember);

      const result = await service.kickMember(guildMember, message, reason);

      expect(result).toEqual(guildMember);
      expect(guildMember.kick).toHaveBeenCalledWith(reason);
    });

    it('should send a message and log an error when kicking fails', async () => {
      const guildMember = TestBootstrapper.getMockDiscordUser();
      const message = TestBootstrapper.getMockDiscordMessage();
      const kickError = new Error('Test error');

      guildMember.kick = jest.fn().mockRejectedValueOnce(kickError);

      await service.kickMember(guildMember, message);

      expect(getChannel(message).send).toHaveBeenCalledWith(`⚠️ Failed to kick member <@${guildMember.id}>! Err: ${kickError.message}`);
    });
  });

  describe('deleteMessage', () => {
    it('should delete the message successfully', async () => {
      const message = TestBootstrapper.getMockDiscordMessage();

      // Setup mocking before calling the function
      message.delete = jest.fn().mockResolvedValue(true);

      // Call function under test
      const result = await service.deleteMessage(message);

      expect(result).toBe(true);
      expect(message.delete).toHaveBeenCalled();
    });
    it('should log an error when message deletion fails', async () => {
      const message = TestBootstrapper.getMockDiscordMessage();
      const deleteError = new Error('Test delete error');

      message.delete = jest.fn().mockRejectedValueOnce(deleteError);

      await service.deleteMessage(message);
    });
  });

  describe('batchSend', () => {
    it('should send messages in batches of 10', async () => {
      const originMessage = TestBootstrapper.getMockDiscordMessage();
      const messages = Array.from({ length: 25 }, (_, i) => `Message ${i + 1}`);
      getChannel(originMessage).send = jest.fn().mockResolvedValue(true);

      await service.batchSend(messages, originMessage);

      expect(getChannel(originMessage).send).toHaveBeenCalledTimes(3);
      expect(getChannel(originMessage).send).toHaveBeenCalledWith(expect.stringContaining('Message 10'));
      expect(getChannel(originMessage).send).toHaveBeenCalledWith(expect.stringContaining('Message 20'));
      expect(getChannel(originMessage).send).toHaveBeenCalledWith(expect.stringContaining('Message 25'));
    });

    it('should send all messages if less than 10', async () => {
      const originMessage = TestBootstrapper.getMockDiscordMessage();
      const messages = Array.from({ length: 5 }, (_, i) => `Message ${i + 1}`);
      getChannel(originMessage).send = jest.fn().mockResolvedValue(true);

      await service.batchSend(messages, originMessage);

      expect(getChannel(originMessage).send).toHaveBeenCalledTimes(1);
      expect(getChannel(originMessage).send).toHaveBeenCalledWith(expect.stringContaining('Message 5'));
    });
  });

  describe('sendDM', () => {
    it('should send a DM to a member successfully', async () => {
      const member = TestBootstrapper.getMockDiscordUser();
      const message = 'Hello, member!';
      member.send = jest.fn().mockResolvedValue(true);

      await service.sendDM(member, message);

      expect(member.send).toHaveBeenCalledWith(message);
    });

    it('should log an error if sending DM fails', async () => {
      const member = TestBootstrapper.getMockDiscordUser();
      const message = 'Hello, member!';
      const error = new Error('Failed to send DM');
      member.send = jest.fn().mockRejectedValue(error);

      await service.sendDM(member, message);

      expect(member.send).toHaveBeenCalledWith(message);
      expect(service['logger'].error).toHaveBeenCalledWith(`Failed to send DM to member ${member.id}`, error);
    });
  });

  describe('getAllRolesFromGuild', () => {
    let mockGuild: any;

    beforeEach(() => {
      mockGuild = TestBootstrapper.getMockGuild('123456789012345678');
      mockGuild.roles.fetch = jest.fn().mockResolvedValue(TestBootstrapper.getMockGuildRoleListCollection());
    });

    it('should fetch all roles from the guild', async () => {
      const result = await service.getAllRolesFromGuild(mockGuild);

      expect(mockGuild.roles.cache.clear).toHaveBeenCalled();
      expect(mockGuild.roles.fetch).toHaveBeenCalled();
      expect(result.get(TestBootstrapper.mockOnboardedRoleId).id).toBeDefined();
      expect(result.size).toBe(TestBootstrapper.getMockGuildRoleListCollection().size);
    });

    it('should throw on Discord error', async () => {
      mockGuild.roles.fetch = jest.fn().mockRejectedValue(new Error('Discord error'));

      await expect(service.getAllRolesFromGuild(mockGuild)).rejects.toThrow(`Failed to fetch roles from guild ${mockGuild.id}. Error: Discord error`);
      expect(mockGuild.roles.cache.clear).toHaveBeenCalled();
    });
  });
});
