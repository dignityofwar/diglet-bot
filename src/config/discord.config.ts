export default () => ({
  devUserId: process.env.DISCORD_DEVUSER_ID,
  guildId: process.env.GUILD_ID_WITH_COMMANDS,
  channels: {
    albionRegistration: process.env.CHANNEL_ALBION_REGISTRATION,
    albionUSRoles: process.env.CHANNEL_ALBION_US_ROLES,
    albionRoles: process.env.CHANNEL_ALBION_EU_ROLES,
    albionUSAnnouncements: process.env.CHANNEL_ALBION_US_ANNOUNCEMENTS,
    albionAnnouncements: process.env.CHANNEL_ALBION_EU_ANNOUNCEMENTS,
    albionScans: process.env.CHANNEL_ALBION_SCANS,
    botJobs: process.env.CHANNEL_BOT_JOBS,
    ps2Verify: process.env.CHANNEL_PS2_VERIFY,
    ps2Private: process.env.CHANNEL_PS2_PRIVATE,
    ps2HowToRankUp: process.env.CHANNEL_PS2_HOW_TO_RANK_UP,
    ps2Scans: process.env.CHANNEL_PS2_SCANS,
    thanosSnaps: process.env.CHANNEL_THANOS_SNAPS,
    activityReports: process.env.CHANNEL_ACTIVITY_REPORTS,
  },
  roles: {
    albionUSMember: process.env.ROLE_ALBION_US_MEMBER,
    albionMember: process.env.ROLE_ALBION_EU_MEMBER,
    albionUSRegistered: process.env.ROLE_ALBION_US_REGISTERED,
    albionRegistered: process.env.ROLE_ALBION_EU_REGISTERED,
    albionUSAnnouncements: process.env.ROLE_ALBION_US_ANNOUNCEMENTS,
    albionAnnouncements: process.env.ROLE_ALBION_EU_ANNOUNCEMENTS,
    ps2Verified: process.env.ROLE_PS2_VERIFIED,
    ps2Zealot: process.env.ROLE_PS2_ZEALOT,
  },
});
