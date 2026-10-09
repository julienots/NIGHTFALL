# NIGHTFALL: Rise of the Abyss — SuperEssence

Jeu d'action-aventure 3D dans le navigateur (Three.js + Vite), **style cartoon
« spooky-fun »** : proportions exagérées, couleurs saturées, ombrage en aplats
(toon) avec liseré lumineux, nuit colorée mais inquiétante.

## Lancer
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build de production dans dist/
npm test           # tests unitaires (inventaire, butin, missions, sauvegarde…)
npm run test:browser   # test de bout en bout dans Chromium (combat, caisses, rechargement…)
```

## Contenu jouable (vertical slice — Vesper Downtown)
- Intro animée du studio SuperEssence, écran titre (Continuer / Nouvelle partie).
- Héros **VANT** : course, sprint, saut, esquive (esquive parfaite), combo 3 coups,
  coup lourd, attaque plongeante, pouvoir **Void Strike**, verrouillage de cible.
- Créatures : **Stalker** (observe, contourne, bondit) et **Brute** (frappe au sol
  télégraphiée, balayage, charge, garde à briser). IA : vision, ouïe, alerte du groupe,
  enquête, repli, retour en zone.
- 3 missions (principale, secondaire avec ascension du toit Corvin, contrat de chasse),
  dialogues radio, documents narratifs.
- Caisses (Supply / Tactical / Elite) : repérage, inspection, ouverture animée, butin
  déterministe. Inventaire (filtres, tri, comparaison, équipement visible sur le héros,
  favoris, démontage), atelier d'amélioration au refuge, niveaux et XP.
- Sauvegarde versionnée résistante à la corruption, paramètres (volumes, sensibilité,
  qualité graphique, sous-titres, taille d'interface…).

## Commandes
ZQSD/WASD déplacer · Maj sprint · Espace saut · Clic gauche combo · Clic droit coup lourd ·
Ctrl/C esquive · F Void Strike · R verrouiller · E interagir · H soin · I inventaire ·
J journal · Échap pause. Manette standard prise en charge.
