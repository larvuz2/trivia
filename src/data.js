// Default game content. Everything here is editable in the Setup panel
// and saved to the browser, so updating the game never needs code changes.

export const CONFIG_VERSION = 1;

const COLORS = {
  boys: ['#3d8bfd', '#20b486', '#f08c2e', '#8b5cf6'],
  girls: ['#ff6b8b', '#ffb020', '#22c3d6', '#e055c8'],
};

// Rigged characters that ship with the game (tools/blender/character.py), matched by name.
// A model uploaded in Setup always wins over these.
export const BUILTIN_MODELS = {
  joe: 'models/characters/joe.glb',
  ray: 'models/characters/ray.glb',
  gabriel: 'models/characters/gabriel.glb',
  gus: 'models/characters/gus.glb',
  baby: 'models/characters/baby.glb',
  pau: 'models/characters/pau.glb',
};
export function builtinModel(name) {
  return BUILTIN_MODELS[String(name || '').trim().toLowerCase()] || null;
}
const BOY_NAMES = ['Joe', 'Ray', 'Gabriel', 'Gus'];
const GIRL_NAMES = ['Girl 1', 'Pau', 'Baby', 'Girl 4'];

const TAGLINES = {
  boys: ['The Captain', 'The Legend', 'The Party Starter', 'The Wild Card'],
  girls: ['The Brains', 'The Trivia Queen', 'The Secret Weapon', 'The Closer'],
};

export function defaultCharacters() {
  const chars = [];
  for (let i = 0; i < 4; i++) {
    chars.push({
      id: `boy${i + 1}`,
      name: BOY_NAMES[i],
      role: 'boy',
      couple: i,
      tagline: TAGLINES.boys[i],
      color: COLORS.boys[i],
      sticker: null, // media ref (idb:key or url)
      model: null, // media ref for a .glb file
    });
    chars.push({
      id: `girl${i + 1}`,
      name: GIRL_NAMES[i],
      role: 'girl',
      couple: i,
      tagline: TAGLINES.girls[i],
      color: COLORS.girls[i],
      sticker: null,
      model: null,
    });
  }
  return chars;
}

export function defaultCategories() {
  return [
    { id: 'boys', name: 'THE BOYS', icon: '👦', color: '#3d8bfd', transition: 'album', description: 'All about the four guys' },
    { id: 'lore', name: 'BRO LORE', icon: '🍻', color: '#f08c2e', transition: 'chest', description: 'Legendary friendship stories' },
    { id: 'man', name: 'KNOW YOUR MAN', icon: '❤️', color: '#ff5a7a', transition: 'heart', description: 'How well do you know him?' },
    { id: 'lapaz', name: 'LA PAZ', icon: '🌴', color: '#14b8a6', transition: 'dive', description: 'Baja California Sur trivia' },
    { id: 'wild', name: 'WILD CARD', icon: '🎲', color: '#a855f7', transition: 'wheel', description: 'Anything goes' },
  ];
}

const Q = (title, answer, extra = {}) => ({
  title,
  answer,
  explanation: '',
  image: null,
  format: 'text', // 'text' | 'image' | 'imageOnly'
  subject: null, // character id the question is about (he reacts!)
  funny: false,
  ...extra,
});

export function defaultQuestions() {
  // questions[categoryIndex][rowIndex]
  return [
    [
      Q('Which of the boys takes the LONGEST to get ready?', 'Host decides!', { funny: true }),
      Q('Who was the first of the boys to get a driver’s license?', 'Ask the boys!'),
      Q('Who is most likely to get lost on the yacht?', 'Host decides!', { funny: true }),
      Q('Which boy had the most embarrassing childhood nickname? Say it!', 'Ask the boys!', { funny: true }),
      Q('Name ALL FOUR boys’ middle names.', 'Ask the boys!'),
    ],
    [
      Q('Where did the four boys first meet?', 'Ask the boys!'),
      Q('What was the boys’ first road-trip destination together?', 'Ask the boys!'),
      Q('Which boy got kicked out of somewhere first — and where?', 'Ask the boys!', { funny: true }),
      Q('What is the name of the boys’ group chat?', 'Ask the boys!', { funny: true }),
      Q('Retell the legendary story the boys refuse to talk about.', 'The boys judge!', { funny: true }),
    ],
    [
      Q('What is your man’s go-to drink order?', 'He decides!'),
      Q('What would your man order at a taco stand in La Paz?', 'He decides!'),
      Q('What is your man’s most-used emoji?', 'Check his phone!', { funny: true }),
      Q('What did your man want to be when he grew up?', 'He decides!'),
      Q('Finish your man’s famous catchphrase.', 'He decides!', { funny: true }),
    ],
    [
      Q('What body of water is La Paz on?', 'The Sea of Cortez (Gulf of California)'),
      Q('What gentle giant can you swim with near La Paz in winter?', 'The whale shark (“tiburón ballena”)', { format: 'image', image: 'img/whale-shark.jpg' }),
      Q('Which protected island off La Paz is famous for its sea lion colony?', 'Isla Espíritu Santo (Los Islotes)'),
      Q('What is the name of La Paz’s famous seaside promenade?', 'El Malecón'),
      Q('What is the name of this beach, famous for its mushroom-shaped rock?', 'Playa Balandra (El Hongo)', { format: 'image', image: 'img/balandra.jpg' }),
    ],
    [
      Q('Which couple has been together the longest?', 'Host decides!'),
      Q('Who is most likely to say “one more and we go home”?', 'Host decides!', { funny: true }),
      Q('Which boy is the worst dancer? He has to prove it!', 'The dance floor decides!', { funny: true }),
      Q('What song will DEFINITELY be played tonight?', 'Host decides!'),
      Q('Which boy cried at a movie most recently — and which movie?', 'Ask the boys!', { funny: true }),
    ],
  ];
}

export function defaultSettings() {
  return {
    timer: 30,
    sound: true,
    music: true,
    stealing: true,
    wrongPenalty: false,
    doubleTrouble: true,
    askTheBoys: true,
    finalSplash: true,
    animations: true,
    teamNames: ['TEAM SUNSET', 'TEAM TIDAL WAVE'],
    teamColors: ['#ff7a45', '#16b8c4'],
  };
}

export function defaultFinal() {
  return {
    title: 'How many years have the four boys been friends?',
    answer: 'Ask the boys!',
    image: null,
    format: 'text',
    category: 'THE FINAL SPLASH',
  };
}

export function defaultConfig() {
  return {
    version: CONFIG_VERSION,
    characters: defaultCharacters(),
    categories: defaultCategories(),
    questions: defaultQuestions(),
    final: defaultFinal(),
    settings: defaultSettings(),
  };
}

export const POINTS = [100, 200, 300, 400, 500];
