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

## Android (APK de test)
Commandes tactiles automatiques sur téléphone (joystick à gauche, glisser à droite pour la
caméra, boutons d'action), paysage plein écran, qualité basse par défaut.
```bash
# Prérequis : JDK 21 et SDK Android (platform 35) ; ANDROID_HOME ou android/local.properties
npm run android:apk   # -> android/app/build/outputs/apk/debug/app-debug.apk
```
L'APK de test est signé avec la clé de débogage (installation manuelle uniquement).

## Monde ouvert (v1.3)
Vesper fait maintenant environ 600 × 600 m : centre-ville, **campus du lycée Vesper-Nord**
(parvis, arrêt de bus, stade), quartier résidentiel **Les Tilleuls** (maison de Noa),
**Parc Vesper** (étang, café, aire de jeux), zone industrielle, **port** avec grues,
**tour Aegis**, quartier d'affaires et **forêt de Blackwood** à l'ouest. Les quartiers
lointains sont masqués automatiquement pour garder un bon rendu sur téléphone.
**Intérieurs visitables** : le lycée (hall, couloir et casiers, salles 12 et 14, labo de
physique, cafétéria) et la maison de Noa (salon, cuisine, chambre).

## Histoire (jouable dès la première seconde)
1. **Prologue — Après les cours** : Noa Vant, 16 ans, somnole en cours de physique. M.
   Delcourt montre un fragment de cristal prêté par Aegis… qui « pique » Noa. Couloir,
   casier, Malik, Camille, puis Inès devant le lycée (dialogues à choix). Aucun pouvoir.
2. **La nuit tombe** (cinématique) : le ciel se déchire, coupure, une créature surgit. On fuit.
3. **Le réveil** : dans une camionnette Aegis, le même cristal, en plus gros, se dissout dans
   le bras de Noa. Son **magnétisme** s'éveille : il arrache le métal alentour et le forge en
   dix anneaux autour de ses avant-bras.
4. **Tutoriel** : anneaux, rafale, bouclier/parade, **soulever et lancer une voiture**, puis **vol**.
5. **Chapitre 1** (nuit) : Mara, le parking, l'enregistrement du père, le Colosse, puis
   **L'Ombre** : une substance noire issue de la faille se lie à Noa (**Forme Abysse**).
6. **Chapitre 2 — Double vie** : lycéen le jour, héros la nuit. Cours (quiz qui rapporte de
   l'XP), amis, cadeaux, **rendez-vous et relation amoureuse** (Inès ou Camille), ronde de
   nuit, la quête de Théo. Dormir chez soi fait passer du jour à la nuit.

L'écran titre propose **Chapitres** pour démarrer directement au chapitre 1 ou 2.

## Pouvoirs
- **Anneaux** (design original) : 10 anneaux portés sur les avant-bras (ils y restent
  collés même en sprint), coups, fouet, rafale guidée, bouclier/parade, propulsion en vol.
- **Magnétisme** (X) : arracher une voiture, une benne ou un baril du sol, le faire léviter
  au-dessus de soi, le lancer sur une créature (dégâts de zone à l'impact). **En vol**, X
  déclenche la **tempête de métal** : jusqu'à 5 objets proches orbitent puis s'abattent.
- **Vol** (V) : stationnaire, incliné, boost, roulis, piqué, atterrissage de super-héros.
- **Forme Abysse** (T, jauge ≥ 50 %) : la substance recouvre Noa (silhouette plus massive,
  yeux cyan, gueule crénelée, tentacules dorsales). Griffes, frappe au sol, tentacules qui
  **attirent** les ennemis, rugissement de zone, bond géant, dégâts subis réduits de moitié,
  se soigne en frappant. La jauge se remplit en combat et se vide transformé.

## Relations
Inès (romance), Camille (romance), Malik, Théo : affinité 0–100, scènes à choix qui se
débloquent (une conversation par jour), cadeaux préférés, paliers d'amitié (XP, tenue),
rendez-vous puis déclaration ; en couple : +10 % d'expérience. Menu **Relations** (L / ❤).

## Commandes
ZQSD/WASD déplacer · Maj courir · Espace saut · Ctrl/C rouler · E parler/interagir ·
1-2-3 choisir une réponse · Clic gauche coups · Clic droit fouet · F rafale · G bouclier ·
X magnétisme · T Forme Abysse · V voler (en vol : Espace monter, Ctrl descendre, Maj boost,
Clic gauche piqué, X tempête de métal) · R verrouiller · H soin · I inventaire · J journal ·
K compétences · L relations · Échap pause. Manette standard prise en charge
(RT magnétisme, croix droite Forme Abysse).
