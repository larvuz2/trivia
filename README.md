# ⛵ Yacht Club Trivia

**La Paz · The Couples Edition** — a cozy 3D party-trivia game on a luxury yacht in La Paz, Baja California.
The four guys have been friends forever. Now the girls have to prove how well they know them.

Jeopardy!-style board + Jackbox-style personality + Overcooked-style miniature 3D, all in the browser (Three.js).

## Run it

```bash
npm install
npm run dev
```

Open the printed URL. For the party, `npm run build` creates a `dist/` folder that runs from anywhere
(it uses relative paths), e.g. `npm run preview`.

## The game flow

1. **Main menu** — the eight characters hang out on the party yacht: one DJs, two sit at the bar, a couple lounges,
   a couple dances. Click the glowing **START** button on the LED dance floor (or press Enter).
2. **Choose your teams** — press SHUFFLE: drumroll, then the couples dash (and sometimes faceplant) into two teams on deck.
   Shuffle again or lock the teams.
3. **Team reveal** — Team Sunset vs Team Tidal Wave.
4. **"NAME'S TURN!"** — every turn belongs to one player. Teams alternate and each team's girls take turns.
   Only that character stays on deck, in a spotlight, with her name huge on screen.
5. **The board** — a glass panel fills most of the screen; the player and the sea stay visible on the left.
   She picks a tile, it flips, and a short category moment plays next to her (photo album, treasure chest, heart,
   camera dive into the water, spinning wheel).
6. **Question** — the host scores it. On a miss the other team's player pops onto deck to steal.
   If the question is about one of the boys, he pops in to react; Ask the Boys brings the team's boys over for a hint.
7. **Final Splash** — secret wagers, one last question.
8. **Yacht champions** — the winners dance around the START button, the losers sulk on the sofas.

The sky slowly turns from afternoon to golden hour to a party night as the board empties, and the yacht's LEDs,
neon sign, string lights, hot tub and dance floor glow brighter.

## Host controls (keyboard)

| Key | Action |
| --- | --- |
| `Space` | Reveal / hide the answer |
| `C` | Correct — award points |
| `X` | Wrong (opens a steal for the other team, if enabled) |
| `N` | No answer — skip |
| `B` | Ask the Boys (once per team, +10 s) |
| `P` | Pause / resume the timer |
| `Esc` | Back to the board without using the tile |
| `Z` | Undo the last question (on the board) |
| `H` | Hide / show the host bar |
| `F` | Fullscreen |
| `?` | Shortcut help |

The host bar at the bottom also has all of these as buttons, plus **Adjust scores**.

## Special mechanics

- **Double Trouble** — one hidden tile (200+) is worth double. It sparkles, but the bonus is revealed only when picked.
- **Ask the Boys** — once per team the girls may ask one boy for a cryptic hint.
- **The Final Splash** — wager up to your score, answer, win or lose the wager.
- **Stealing** — if a team misses, the other team gets a shot.
- Teasing: big lead swings shake the camera; the trailing team gets a little rain cloud; someone falls asleep on long questions; the boy a question is about reacts.

## The party yacht (built in Blender)

`tools/blender/yacht.py` models the yacht from scratch (concept reference made with FLUX on fal):

- Lofted hull with a raked bow, navy boot band, coral pinstripe, chrome rub rail, dark hull windows and portholes,
  underwater LEDs, fenders, anchor.
- Swim platform with twin stairs, boarding ladder, paddle boards, the YACHT CLUB · LA PAZ name board and a Mexican ensign.
- **Party deck:** LED dance floor with the START pedestal, a walnut-and-marble bar with stools, cocktails, back bar
  with bottles and a pink neon sign, a DJ booth with decks and speaker stacks, a disco ball, a stern lounge with
  champagne and fruit, side lounges, palms, life rings, string lights and bunting.
- **Flybridge:** glowing hot tub, striped sun pads, a second bar, lounge, helm, hardtop with radar arch and domes.
- **Bow:** big sun pads with towels, bean bags, windlass.
- Floats on the water: a pink flamingo and a sprinkled donut.

Textures come from `tools/blender/textures.py`: teak decking (with normal map), walnut, marble, canvas cushion fabric,
stripes, neon sign, name board, flag, dance floor and hot tub water. The game reads named parts
(`start_button`, `dance_floor`, `disco_ball`, …) and `yacht-layout.json` (where people sit, dance and stand).
`tools/yacht-viewer.html` shows the yacht on its own.

## The Sea of Cortez scenery (built in Blender)

The world around the yacht is generated with Blender scripts in `tools/blender/`:

| Script | What it builds |
| --- | --- |
| `bay.py` | The bay: an Espíritu Santo–style terraced red mesa island, the Balandra headland with its white beach, ankle-deep lagoon and sandbar, the Los Arcos granite islet with a golden spit, Los Islotes sea-lion rocks and the mainland desert coast. Also bakes `bay-depth.png` (the water depth map) and `bay-places.json` (where cacti, palms, palapas and boulders go). |
| `sierra.py` | Layered Sierra de la Giganta ranges around the horizon. |
| `props.py` | Cardón cacti, desert scrub, fan palms, palapas, a panga, kayakers, El Arco–style granite arch, El Hongo, boulders, pelicans (with flapping wings), sea lions and dolphins. |

Everything is low-poly with baked vertex colors (no textures), matching the toy-like look.
The water shader colors the sea by the baked depth: sand-bright aqua shallows → turquoise → teal → deep Sea of Cortez blue,
with caustics, seabed patches, shoreline foam, sun sparkles and a soft horizon haze. The time of day runs from a clear Baja
afternoon to golden hour to a party night as the board empties.

Life on the water: pangas with foam wakes, kayakers, pelicans that circle and plunge-dive, a dolphin pod, sea lions, and
white wash around the yacht's hull.

To rebuild the scenery (needs Python 3.13):

```bash
pip install bpy==5.2.3 pillow numpy
```
```bash
npm run build:env
```

`tools/gallery.html` (open `/tools/gallery.html` on the dev server) shows all the props side by side.

## Game Setup (host only)

Click **⚙ Game Setup** on the main menu. Everything saves in the browser as you type.

- **Characters & Couples** — names, roles, couple pairing, colors, face sticker upload, and a `.glb` 3D model upload per person.
  Placeholder chibi characters are used until a model is uploaded. If the `.glb` contains animation clips named
  `idle`, `run`/`walk`, `cheer`, `sad`, `laugh`, `dance`, `surprise`, they play automatically.
- **Categories** — name, icon, color and which 3D transition each column uses.
- **Questions** — 25 editors: title, private answer, explanation, format (text / image + question / image only),
  image upload, which boy it's about, and a "funny" flag.
- **Final Splash**, **Settings** (timer, stealing, penalties, Double Trouble, Ask the Boys, sound, music, team names/colors).
- **Save / Load** — download everything (including photos and models) as one `.json` file and load it on the party laptop.

Game progress also auto-saves, so a refresh offers **Continue saved game**.

## Assets

- `public/models/yacht.glb` + `yacht-layout.json` — the party yacht, built with `tools/blender/yacht.py`.
- `public/models/env/*` — the Sea of Cortez scenery built with the Blender scripts above.
- `public/img/*.jpg` — La Paz question illustrations generated with **FLUX on fal.ai**.
- Everything else (water and sky shaders, characters, board, deck props, sounds and music) is procedural.

## Code map

| File | Responsibility |
| --- | --- |
| `src/world.js` | Sky, Sea of Cortez water shader, lights, the yacht, deck props, day → golden hour → party blend |
| `src/environment.js` | Loads and places the Blender scenery; pangas, kayaks, pelicans, dolphins, sea lions, foam |
| `src/characters.js` | Placeholder characters, procedural animation library, `.glb` swap-in, 2D stickers |
| `src/fx.js` | Confetti, splashes and the five category cinematic props |
| `src/camera.js` | Camera shots, orbits, shake |
| `src/game.js` | Rules: teams, turns, scoring, steal, undo, Double Trouble, Final Splash |
| `src/main.js` | Screens / state machine (deck start button, teams, turns, glass board panel), cinematics, host controls |
| `src/admin.js` | Setup panel |
| `src/storage.js` | localStorage + IndexedDB persistence, export / import |
| `src/audio.js` | Synthesized sound effects and music loop |
| `src/data.js` | Default characters, categories, questions and settings |
