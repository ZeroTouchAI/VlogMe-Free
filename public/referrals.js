// ---------------------------------------------------------------
// ALL money links and owner links live in this one file.
// Edit here; nothing else in the app needs to change.
// ---------------------------------------------------------------

// Shown in the footer.
export const OWNER = { name: 'Zero Touch AI', url: 'https://zerotouchai.com' };

// "More from the makers" line in the footer. Leave empty and it stays hidden.
// { name: 'Project name', url: 'https://...', blurb: 'One line about it.' }
export const MORE_PROJECTS = [
  { name: 'Carinly', url: 'https://carinly.com/?utm_source=higgsview&utm_medium=referral', blurb: 'A private app for long distance couples: messages translated as they arrive, shared clocks, games and visit planning.' },
  { name: 'Effortless Social Media', url: 'https://effortlesssocialmedia.zerotouchai.com/?utm_source=higgsview&utm_medium=referral', blurb: 'Social media on autopilot. AI finds and creates on-brand content, you approve it, and it posts for you.' },
  { name: 'Effortless Cold Calling', url: 'https://effortlesscoldcalling.zerotouchai.com/?utm_source=higgsview&utm_medium=referral', blurb: 'AI agents call and qualify leads for you, then flag the interested ones so you can follow up.' },
  { name: 'Effortless UGC', url: 'https://effortlessugc.netlify.app/?utm_source=higgsview&utm_medium=referral', blurb: 'Turn one product photo into an on-brand, UGC-style ad shot in about a minute.' },
];

// Plain (non-affiliate) helper links.
export const LINKS = {
  geminiKey: 'https://aistudio.google.com/apikey',
  pixabayMusic: 'https://pixabay.com/music/',
};

// Affiliate / referral links. Set enabled:true once you have a real URL.
// placements: 'setup'  -> shown in the key-setup step
//             'quota'  -> shown when that service reports a limit/quota error
//             'tools'  -> shown in the "Tools we like" section near the footer
export const REFERRALS = [
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    url: 'https://try.elevenlabs.io/llb03297ux9w',
    enabled: true,
    placements: ['setup', 'quota'],
    setup: 'Needed for the narration voice. The free plan works to try it; longer videos use more characters.',
    quota: 'Looks like your ElevenLabs plan is out of credits or limited. Upgrading gets you more narration.',
  },
  // Example (copy, fill in, set enabled:true):
  // {
  //   id: 'music',
  //   name: 'Royalty-free music',
  //   url: 'https://...',
  //   enabled: false,
  //   placements: ['tools'],
  //   tools: 'One line on why a vlogger would want this.',
  // },
];

export const DISCLOSURE =
  'Some links on this site are affiliate links. If you sign up or upgrade through them, this project may earn a commission at no extra cost to you.';
