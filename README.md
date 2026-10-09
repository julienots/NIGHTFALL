# NIGHTFALL: Rise of the Abyss — SuperEssence

Jeu web (Vite). État actuel : séquence de démarrage avec l'intro animée du studio
**SuperEssence**, suivie d'un écran titre provisoire. Le gameplay n'est pas encore développé.

## Lancer
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build de production dans dist/
```

## Intro du studio
- `src/intro/StudioIntro.js` : animation sur canvas, fonction pure du temps (`renderAt(t)`).
  Les lettres tombent une à une (étirement, écrasement, rebond), le point final provoque
  un impact (onde de choc, étincelles, secousse), puis un reflet traverse le logo et
  « PRÉSENTE » apparaît. Durée : 6,5 s, passable par touche ou clic.
- `src/intro/sfx.js` : sons synthétisés en Web Audio (aucun fichier audio).
- `public/assets/brand/` : lettres découpées depuis le logo d'origine
  (`assets_src/brand/superessence_logo_source.jpg`) par `npm run logo:extract`.
- `npm run intro:video` : exporte l'intro en MP4 1920×1080 60 i/s (sans son) dans `exports/`.
