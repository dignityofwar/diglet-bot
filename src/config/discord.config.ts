export default () => ({
  devUserId: process.env.DISCORD_DEVUSER_ID,
  guildId: process.env.GUILD_ID_WITH_COMMANDS,
  channels: {
    albionRegistration: process.env.CHANNEL_ALBION_REGISTRATION,
    albionRegistrationQueue: process.env.CHANNEL_ALBION_REGISTRATION_QUEUE,
    albionRoles: process.env.CHANNEL_ALBION_EU_ROLES,
    albionAnnouncements: process.env.CHANNEL_ALBION_EU_ANNOUNCEMENTS,
    albionScans: process.env.CHANNEL_ALBION_SCANS,
    botJobs: process.env.CHANNEL_BOT_JOBS,
    chitChat: process.env.CHANNEL_CHIT_CHAT,
    // Named to keep it distinct from the `roles` map below, which holds role IDs not channels
    roleSelection: process.env.CHANNEL_ROLES,
    ps2Verify: process.env.CHANNEL_PS2_VERIFY,
    ps2Private: process.env.CHANNEL_PS2_PRIVATE,
    ps2HowToRankUp: process.env.CHANNEL_PS2_HOW_TO_RANK_UP,
    ps2Scans: process.env.CHANNEL_PS2_SCANS,
    activityReports: process.env.CHANNEL_ACTIVITY_REPORTS,
    judgementHall: process.env.CHANNEL_ALBION_JUDGEMENT_HALL,
  },
  roles: {
    albionMember: process.env.ROLE_ALBION_EU_MEMBER,
    albionRegistered: process.env.ROLE_ALBION_EU_REGISTERED,
    albionAnnouncements: process.env.ROLE_ALBION_EU_ANNOUNCEMENTS,
    ps2Verified: process.env.ROLE_PS2_VERIFIED,
    ps2Zealot: process.env.ROLE_PS2_ZEALOT,
  },
});
