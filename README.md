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

1. **Main menu** — all eight characters idle on the yacht; slow cinematic orbit of the bay.
2. **The shuffle** — couples gather, drumroll, then dash (and sometimes faceplant) into two teams.
   Shuffle again or lock the teams.
3. **Team reveal** — Team Sunset vs Team Tidal Wave, stickers and scores.
4. **The board** — a physical 5×5 board on the aft deck, flanked by two giant scoreboards. Teams alternate picks.
5. **Question reveal** — a 5-second cinematic: tile lights up → camera launches into the board → a character
   moment with a category prop (photo album, treasure chest, heart, water dive, spinning wheel) → card flies in.
6. **Answer & reaction** — the host scores it; characters cheer, cry, laugh, get surprised; confetti.
7. **Final Splash** — secret wagers, one last question, simultaneous reveal.
8. **Yacht champions** — the winners dance, the losers sulk.

The sky slowly turns from golden hour into a starry party night as the board empties, and the string lights glow brighter.

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

- `public/models/yacht.glb` — the yacht, generated from the concept art with **Tripo v2.5 image-to-3D on fal.ai**,
  then optimized (2048 px WebP textures, 9 MB → 2 MB).
- `public/img/*.jpg` — La Paz question illustrations generated with **FLUX on fal.ai**.
- Everything else (ocean, sky, Baja mountains, islands, characters, board, props, sounds and music) is procedural.

## Code map

| File | Responsibility |
| --- | --- |
| `src/world.js` | Sky, ocean shader, Baja mountains & islands, the yacht, lights, deck props, golden-hour → party blend |
| `src/characters.js` | Placeholder characters, procedural animation library, `.glb` swap-in, 2D stickers |
| `src/board.js` | The 3D trivia board and the two scoreboards |
| `src/fx.js` | Confetti, splashes and the five category cinematic props |
| `src/camera.js` | Camera shots, orbits, shake |
| `src/game.js` | Rules: teams, turns, scoring, steal, undo, Double Trouble, Final Splash |
| `src/main.js` | Screens / state machine, cinematics, host controls |
| `src/admin.js` | Setup panel |
| `src/storage.js` | localStorage + IndexedDB persistence, export / import |
| `src/audio.js` | Synthesized sound effects and music loop |
| `src/data.js` | Default characters, categories, questions and settings |
