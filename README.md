# METEOR REVERIE ~ 유성환상

A Touhou-style **bullet-hell (탄막) shooting game** built with the HTML5 Canvas — no build step, no external assets. Everything (graphics, SFX, BGM) is generated procedurally at runtime.

- **Keyboard + Mouse** support (move, shoot, bomb, focus, pause, mute)
- 7 named **spell cards** (spirals, rings, aimed spreads, flowers, cross-fire, rotating lasers, resonance finale)
- **Graze** mechanic (skim bullets for score + sparkle), **bombs** (screen clear), combo multiplier
- Game-feel: additive glow rendering, screen shake, hit-stop, flash, floating score popups, animated spell-card banners, boss intro/death sequences
- Procedural **Web Audio** SFX + looping BGM (synthesized — no audio files)
- **Best score** saved to `localStorage`
- Responsive: auto-scales to any viewport

## Controls

| Action | Keys | Mouse |
|---|---|---|
| Move | `← → ↑ ↓` / `W A S D` | Move cursor |
| Shoot | `Z` / `Space` | Left click |
| Bomb | `X` | Right click |
| Focus (slow + hitbox) | `Shift` | — |
| Pause | `Esc` / `P` | — |
| Mute | `M` | ♪ button |
| Start / Retry | `Enter` / Click | Click |

> Right-click is used for bombs — the context menu is suppressed inside the playfield.

## Run locally

Because the game uses ES modules (`type="module"`), open it via a local web server (not `file://`):

```bash
# from this directory
python3 -m http.server 8000
# then open http://localhost:8000
```

Or any static server works (`npx serve`, VS Code Live Server, etc.).

## Deploy to GitHub Pages

This is a pure static site — no build step.

1. Create a new GitHub repository (e.g. `meteor-reverie`) and push these files:
   ```bash
   git init
   git add .
   git commit -m "Meteor Reverie bullet-hell game"
   git branch -M main
   git remote add origin https://github.com/<your-user>/meteor-reverie.git
   git push -u origin main
   ```
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Set branch to **`main`** and folder to **`/ (root)`**, then **Save**.
4. Wait ~1 minute. Your game will be live at:
   ```
   https://<your-user>.github.io/meteor-reverie/
   ```

> Tip: if you deploy to a project subpath, the relative paths (`style.css`, `js/main.js`) already work since nothing is absolute.

## Project structure

```
index.html        # UI shell + overlays (title/pause/over/win)
style.css         # premium theming, responsive scaling
package.json      # type: module + helper scripts
js/
  utils.js        # math, easing, rng, color, format helpers
  input.js        # unified keyboard + mouse input manager
  audio.js        # Web Audio synthesized SFX + procedural BGM
  gfx.js          # sprite cache, starfield/nebula bg, particles, camera, text
  bullets.js      # Bullet + pooled BulletManager + Laser
  patterns.js     # named spell-card bullet patterns + lineup
  player.js       # player ship: movement, shots, graze, bombs, invuln
  boss.js         # boss entity: spell-card cycling, intro/death, render
  game.js         # state machine, collision, HUD, game-feel orchestration
  main.js         # bootstrap, fixed-timestep loop, scaling, UI wiring
```

## Tech notes

- **No dependencies.** Vanilla ES modules + Canvas 2D + Web Audio API.
- Fixed-timestep simulation at 60 Hz with an accumulator (deterministic feel, decoupled from render rate).
- Bullets are **object-pooled** to keep GC pressure low during dense patterns.
- All glow sprites are pre-rendered once to offscreen canvases and blitted with `globalCompositeOperation = 'lighter'` for the additive bloom look.
