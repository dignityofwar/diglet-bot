export default () => ({
  devUserId: process.env.DISCORD_DEVUSER_ID,
  channels: {
    albionRegistration: process.env.CHANNEL_ALBION_REGISTRATION,
    albionInfopoint: process.env.CHANNEL_ALBION_INFOPOINT,
    albionScans: process.env.CHANNEL_ALBION_SCANS,
    ps2Verify: process.env.CHANNEL_PS2_VERIFY,
    ps2Private: process.env.CHANNEL_PS2_PRIVATE,
    ps2HowToRankUp: process.env.CHANNEL_PS2_HOW_TO_RANK_UP,
    ps2Scans: process.env.CHANNEL_PS2_SCANS,
  },
  roles: {
    albionInitiateRoleId: process.env.ROLE_ALBION_INITIATE,
    albionRegisteredRoleId: process.env.ROLE_ALBION_VERIFIED,
    albionBaseRole: process.env.ROLE_ALBION_BASE,
    ps2Verified: process.env.ROLE_PS2_VERIFIED,
    ps2Zealot: process.env.ROLE_PS2_ZEALOT,
  },
});
