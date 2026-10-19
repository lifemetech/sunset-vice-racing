# 🌆 Sunset Vice Racing — 3D City Racing Game

Ek Vice-City-style neon waterfront city me 3D car racing game. Pure **Three.js** me bana hai — koi build step nahi, koi server nahi. Seedha GitHub Pages par host karo aur desktop browser me khelo.

## 🎮 Khelo kaise (GitHub Pages — free hosting)

1. GitHub par naya repository banao (jaise `sunset-vice-racing`).
2. Is folder ki 3 files upload karo: `index.html`, `styles.css`, `game.js`
   ("Add file" → "Upload files" se drag-and-drop).
3. Repository ke **Settings → Pages** me jao:
   - **Source**: "Deploy from a branch"
   - **Branch**: `main` → `/(root)` → **Save**
4. 1–2 minute me game live: `https://tumhara-username.github.io/sunset-vice-racing/`
5. Desktop Chrome/Edge me kholo aur **START RACE** dabao.

> 💡 Keyboard chahiye (WASD / Arrow keys). Desktop/laptop par best chalega.

## 🕹️ Controls

| Key | Kaam |
|---|---|
| W A S D / Arrow keys | Drive |
| SPACE | Handbrake / drift |
| R | Reset (last checkpoint par wapas) |
| M | Mute / unmute |

## ✨ Features

- **Procedural Vice-City-style city** — pastel Art-Deco buildings, glowing windows, palm trees, beach + animated ocean, streetlights, neon billboard
- **Sunset lighting** — warm directional sun with real-time shadows, fog, glowing sky
- **Arcade car physics** — acceleration, braking, speed-sensitive steering, handbrake drifts with dust particles
- **Checkpoint race** — 12 glowing gates, live timer, best-time saved in browser
- **Chase camera** — speed ke saath FOV badhta hai, smooth follow
- **Minimap** — live car position + next checkpoint
- **Synthesized audio** — engine sound (speed ke saath pitch), skid, checkpoint chime — koi audio file nahi
- **Headlights** — real spotlight + light cone

## 🔧 Customize karna ho to (`game.js` me)

- `CFG.carMaxF` — top speed (default 58)
- `CFG.gates` — checkpoint positions ki list
- `pastel` array — building colors
- `CFG.roadN` — city grid size (bada map = zyada buildings = thoda slow)

## 📁 Files

- `index.html` — page + HUD + menus
- `styles.css` — neon menu/HUD styling
- `game.js` — poora game (Three.js r160 CDN se)
