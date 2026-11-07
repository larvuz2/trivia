# ⛵ Compitas Trivia

**La Paz 2026** — a cozy 3D party-trivia game on a luxury yacht in La Paz, Baja California.
The four guys have been friends forever. Now the girls have to prove how well they know them.

Jeopardy!-style board + Jackbox-style personality + Overcooked-style miniature 3D, all in the browser (Three.js).

## Deploy on Netlify (and save questions/photos there)

The repo is ready for Netlify — `netlify.toml` builds with `npm run build` and publishes `dist/`.

1. In Netlify: **Add new site → Import an existing project → GitHub →** pick this repo.
   Branch to deploy: `claude/elegant-turing-edkob3` (or whichever branch you merge into).
   Build settings are read from `netlify.toml` — nothing to type.
2. **Site configuration → Environment variables → Add a variable:** `ADMIN_PASSWORD` = a password only the host knows.
   Then **Deploys → Trigger deploy** so the functions pick it up.
3. Open the site → **⚙ Game Setup** → enter the host password in the yellow bar → upload photos, edit questions.
   The chip in the top-right of Setup shows **☁️ Saved to Netlify** when everything is stored.

How it works (no database): two small Netlify Functions store everything in **Netlify Blobs**, the file storage built into
every Netlify site.

| Endpoint | What |
| --- | --- |
| `GET /api/content` | the shared setup (characters, categories, questions, settings) — everyone reads it on load |
| `PUT /api/content` | save it (needs the host password) — Setup does this automatically ~1 s after each change |
| `POST /api/media` | upload a photo / sticker / `.glb` (needs the host password); photos are resized in the browser first |
| `GET /api/media/:id` | serve an uploaded file (cached) |

Notes:
- Uploads are limited to ~5 MB per file by Netlify Functions. Photos are shrunk automatically; big 3D models can go
  in the repo instead (`public/models/…`).
- Anything uploaded while locked or offline stays on that device until you press **Save / Load → Publish everything now**.
- **Download game file** still makes a full backup you can load anywhere.
- The in-progress game (scores, used tiles) stays in the browser of the device running the game.
- Local: `npm run dev` uses this browser's storage. To try the Netlify functions locally: `npx netlify dev`
  (with `ADMIN_PASSWORD` set in your shell).

## Run it

```bash
npm install
npm run dev
```

Open the printed URL. For the party, `npm run build` creates a `dist/` folder that runs from anywhere
(it uses relative paths), e.g. `npm run preview`.

## The game flow

1. **Main menu** — just the yacht and the Sea of Cortez (nobody on deck yet). Click the glowing **START** button on
   the LED dance floor (or press Enter).
2. **Opening cinematic (~15 s)** — letterboxed, with fades through black: a low angle as the yacht cruises in with its
   wake, a seagull tracking alongside, then the DJ drops the beat and the deck lights up. Esc skips the cinematic; the tiny *Skip intro* button (bottom-left, shown for the whole intro) jumps straight to the teams.
3. **Introducing the gang** — fixed camera on deck at night, party beams sweeping. One at a time the salon doors slide
   open and a character walks out to their mark: confetti cannons, crowd cheer, a lower-third name plate, and a loop
   pose. **Host: click (or Space) for the next one** — they walk past the camera and a big title card introduces the
   next guest. After the eighth, the whole gang walks in and the TV on deck shows **▶ START GAME** — click the TV
   (or press Enter) to continue. Taglines are editable in Setup → Characters.
   The loop pose is a placeholder: a rigged `.glb` with a clip named `intro` / `pose` / `showoff` plays instead
   (`walk` / `run` clips are used for walking).
4. **Choose your teams** — press SHUFFLE: drumroll, then the couples dash (and sometimes faceplant) into two teams on deck.
   Shuffle again or lock the teams.
5. **Team reveal** — Team Sunset vs Team Tidal Wave.
6. **"NAME'S TURN!"** — every turn belongs to one player. Teams alternate and each team's girls take turns.
   Only that character stays on deck, in a spotlight, with her name huge on screen.
7. **The board** — a glass panel fills most of the screen; the player and the sea stay visible on the left.
   She picks a tile, it flips, and a short category moment plays next to her (photo album, treasure chest, heart,
   camera dive into the water, spinning wheel).
8. **Question** — the host scores it. On a miss the other team's player pops onto deck to steal.
   If the question is about one of the boys, he pops in to react; Ask the Boys brings the team's boys over for a hint.
9. **Final Splash** — secret wagers, one last question.
10. **Curtain call** — the whole gang lines up on the swim platform at the very back of the yacht, under the
    COMPITAS name board, cheering in waves (a few at a time, the rest idle) with confetti. Click / Space to continue.
11. **Yacht champions** — the winners dance around the START button, the losers sulk nearby.

The sky slowly turns from afternoon to golden hour to a party night as the board empties, and the yacht's LEDs,
neon sign, string lights, hot tub and dance floor glow brighter.

## 🎬 Movie mode

The 🎬 button on the main menu plays little ~10-second scenes with the gang, with cinematic camera moves, fades
and letterboxing, on a loop until you press **✕ Exit** (or Esc). **Next ⏭** (or →) skips ahead.

1. **Curtain call** — everyone on the swim platform under the COMPITAS name board
2. **The bar** — the four boys toasting (cups, a margarita, a beer)
3. **Sun’s out** — the girls sunbathing on the flybridge pads (drone shot)
4. **Hot tub time** — all eight in the jacuzzi upstairs
5. **Dance floor** — a dance circle on the LED floor with the party lights
6. **Swim call** — everyone in the water behind the boat, inflatables and a beach ball
7. **DJ Joe** — Joe on the decks with headphones, the gang dancing in front
8. **A few drinks later…** — Ray barrel-rolling across the deck while everyone laughs
9. **Gone fishing** — Gabriel fishing off the side deck; a dorado jumps
10. **Selfie fail** — Gus backs up for the perfect selfie… and goes overboard (still filming)
11. **Conga!** — the conga line… and the domino pile-up

Props are built in Blender (`tools/blender/movie_props.py` → `public/models/movie_props.glb`): fishing rod,
DJ headphones, cups, margarita, beer, phone, dorado and beach ball. The scene clips (cheers, sunbathe, swim, fish,
dj, selfie, conga, laugh, dance2) are part of the shared character rig (`tools/blender/character.py`).
Code: `src/movie.js`.

## Explore the yacht (physics)

From the main menu press **🕹️** to walk around the yacht as one of the characters. Real physics (Rapier) runs on
the deck: walk or run into the bar stools and coffee tables to push them over, jump next to the bar to knock the
bottles off the shelves, shove things with **E**, or click any prop to flick it. Things knocked overboard float.

| Key | |
| --- | --- |
| WASD / arrows | walk (camera-relative) |
| Shift | run |
| Space | jump |
| E | shove whatever is in front of you |
| Click | poke / flick a prop |
| Drag · Scroll | look around · zoom |
| Tab | switch character |
| R | put everything back |
| Esc | back to the menu (props reset) |

Physics props are tagged in Blender (`dynamic()` in `tools/blender/yacht.py` → glTF extras `{ dyn, mass }`):
8 stools, 3 tables, 60 bottles, 6 cocktail glasses, the champagne bucket, the fruit bowl and 3 bean bags.
The rest of the yacht is one static collision mesh. Rapier only downloads when Explore is opened.

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
- Swim platform with twin stairs, boarding ladder, paddle boards, the COMPITAS · LA PAZ 2026 name board and a Mexican ensign.
- **Party deck:** LED dance floor with the START pedestal, a walnut-and-marble bar with stools, cocktails, back bar
  with bottles and a pink "COMPITAS" neon sign, a DJ booth with decks and speaker stacks, a disco ball, a stern lounge with
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
  Built-in rigged characters (see below) load automatically by name — whoever is named **Joe** gets Joe's model.
  Everyone else stays a placeholder chibi until a model is added. An uploaded `.glb` always wins; clips named
  `idle`, `idle2`, `walk`, `wave`, `dance`, `excited`/`cheer` play automatically.
- **Categories** — name, icon, color and which 3D transition each column uses.
- **Questions** — 25 editors: title, private answer, explanation, format (text / image + question / image only),
  a question image (before the reveal) and an optional answer image that replaces it when the answer is revealed,
  which boy it's about, and a "funny" flag. **▶ Preview** plays that one question exactly as in the game
  (Space = reveal / back, Esc = close).
- **Final Splash**, **Settings** (timer, stealing, penalties, Double Trouble, Ask the Boys, sound, music, team names/colors).
- **Save / Load** — download everything (including photos and models) as one `.json` file and load it on the party laptop.

Game progress also auto-saves, so a refresh offers **Continue saved game**.

## 3D characters (Meshy → Blender rig → game)

Each person is generated with **Meshy v6 (image-to-3D on fal.ai)** from a T-pose picture, then rigged and animated by
`tools/blender/character.py`, so every character ends up with:

- the **same height** (2.0 units, feet on the floor, facing forward) and the **same 19-bone skeleton** at the same
  proportional joint heights — so every animation clip works on every character;
- a **rigid head**: the face is weighted 100% to the head bone, so the expression never deforms;
- **long hair** is detected by its texture colour (traced down from the head across UV seams) and follows the
  head and chest, never the arms, so it does not tear when the arms move;
- clips **idle, idle2, excited, dance, wave, walk**, plus `sit` and the movie-mode clips;
- mid-weight files: ~40k-triangle mesh, 2K color texture, 1K normal + roughness (webp) — about 3 MB each.

```bash
FAL_KEY=... node tools/characters/generate.mjs tools/characters/maria_ref.jpg maria   # -> tools/characters/maria_src.glb
pip install bpy                                                                      # Blender as a Python module
BLENDER_PY=python3 tools/characters/build.sh maria                                   # -> public/models/characters/maria.glb
```

Register new characters in `BUILTIN_MODELS` (`src/data.js`).
`tools/character-viewer.html?model=joe` (on the dev server) shows every clip side by side.

On deck everyone stands in an arc behind the start pedestal, facing center stage, looping their idles and
dropping in a wave, a dance or a cheer every few seconds.

## Assets

- `public/models/characters/*.glb` — rigged characters (Meshy v6 + `tools/blender/character.py`).
- `public/models/creatures.glb` — the sea creatures in the same toy-3D style, made with fal: GPT Image 2 concept art
  (`tools/creatures/concept.mjs`, the characters' picture as the style reference) → Meshy v6 → `tools/blender/creatures.py`
  (orient, size, split the flying gull's wings so they flap). The flying **seagull** (opening shot), a quirky big-eyed
  **gull** perched on the railings and the stern (breathing, head turns, hops), the **dolphin** pod, a **marlin** that
  leaps near the yacht now and then, and the **dorado** in the fishing scene. Preview: `tools/creatures-viewer.html`.
- `public/models/yacht.glb` + `yacht-layout.json` — the party yacht, built with `tools/blender/yacht.py`.
- `public/models/env/*` — the Sea of Cortez scenery built with the Blender scripts above.
- `public/img/*.jpg` — La Paz question illustrations generated with **FLUX on fal.ai**.
- Everything else (water and sky shaders, characters, board, deck props, sounds and music) is procedural.

## Performance & stability

- **Crash-proof loop**: the next frame is scheduled first and every system (world, scenery, intro, movie,
  characters, camera, render…) runs in its own try/catch — an error is logged once, the game keeps going.
- **Graphics recovery**: if the browser drops the WebGL context (GPU reset, memory pressure, sleep/wake) the game
  saves, reloads and drops straight back into the saved game.
- **Adaptive resolution**: full sharpness (up to 2× on retina) whenever the machine keeps up; only if it stays under
  ~33 fps does it render a notch softer, and it climbs back when there is headroom.
- **Batched bottles**: the 60 bar bottles (physics props) are drawn as one merged mesh per material while they
  stand still (~240 → ~22 draw calls, no shadow pass); explore mode swaps the real physics bottles back in.
  Overall ~460 → ~190 draw calls per frame.
- **No leaks**: category transition props, per-scene movie geometry and replaced character models free their GPU
  memory; hidden characters skip their animation work; the music sequencer never bursts after a background tab.
- `window.yct.perf` shows per-system frame timings (ms) and error counts.

## Code map

| File | Responsibility |
| --- | --- |
| `src/world.js` | Sky, Sea of Cortez water shader, lights, the yacht, deck props, day → golden hour → party blend |
| `src/environment.js` | Loads and places the Blender scenery; pangas, kayaks, pelicans, dolphins, sea lions, foam |
| `src/characters.js` | Placeholder characters, procedural animation library, `.glb` swap-in + clip playback (idle variety, walk speed), 2D stickers |
| `src/fx.js` | Confetti, splashes and the five category cinematic props |
| `src/camera.js` | Camera shots, orbits, shake |
| `src/game.js` | Rules: teams, turns, scoring, steal, undo, Double Trouble, Final Splash |
| `src/explore.js` | Explore mode: Rapier physics world, character controller, follow camera, push / jump-swipe / shove / poke, impact sounds, floating, reset |
| `src/intro.js` | Opening cinematic (shots, fades, letterbox, captions, cruising yacht, seagulls) and the character introductions (doors, walk-outs, title cards, finale, START GAME TV) |
| `src/main.js` | Screens / state machine (deck start button, teams, turns, glass board panel), cinematics, host controls |
| `src/admin.js` | Setup panel |
| `src/storage.js` | localStorage + IndexedDB persistence, export / import |
| `src/audio.js` | Synthesized SFX + adaptive music: a beat-synced sequencer with layers (pad, arp, bass, kick, hats, clap, shaker), states that crossfade (menu, cinematic, party, duck, game, question) and stingers (riser, impact, airhorn, crowd cheer, confetti cannon) |
| `src/data.js` | Default characters, categories, questions and settings |
