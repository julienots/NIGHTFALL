# NIGHTFALL: Rise of the Abyss — SuperEssence

Jeu d'action-aventure 3D **en monde ouvert** dans le navigateur et sur Android (Three.js + Vite +
Capacitor), univers **dark fantasy**, rendu réaliste (voir « Rendu réaliste »).

## v2.0 — Les Marches de Vesper (monde ouvert)
« Nouvelle partie » lance le monde ouvert ; l'ancienne campagne en ville reste jouable via
« Ancienne campagne » sur l'écran titre.

**Lore.** Mille ans après la chute du royaume de Vesper. La reine Ysolde, qui voulait arrêter le
temps, a ouvert la Faille au nord : l'Abysse s'en échappe, les lanternes se sont éteintes (le
Nightfall). Sept Veilleurs, armés d'anneaux de métal d'étoile, ont dressé trois Sceaux pour la
contenir… pour mille ans. Les Sceaux se fissurent. Noa s'éveille au Sanctuaire des Veilleurs, sans
mémoire, dix anneaux aux avant-bras. Huit stèles (les **Mémoires**) racontent le reste, dans le
désordre, à qui explore.

**Liberté.** Seule la première quête guide (stèle → Brumeval → Aldric). Ensuite : les **trois
Sceaux** (Aube, Marées, Cendres) dans l'ordre qu'on veut, chacun gardé de jour comme de nuit ;
ils rendent le **vol** (Aube) et la **Forme Abysse** (Marées). Les trois ranimés ouvrent la
**Faille** et son gardien. Quêtes de villages (Bran le chasseur, Maëlle la guérisseuse),
coffres, ruines, cycle **jour / nuit continu** (≈ 16 min) : les Rôdeurs sortent la nuit.

**Monde.** ≈ 600 × 600 m jouables bordés de montagnes : collines, prairies, forêt de pins à
l'ouest, lac des Saules, rivière et ponts, trois villages à colombages (Brumeval, Cendreval,
Port-Saule) avec habitants, lanternes et fenêtres qui s'allument le soir, Sanctuaire, Tour de guet,
Fort du Col, la Faille. Lucioles la nuit.

**Herbe interactive** (`src/game/world/grass.js`) : des centaines de milliers de brins calculés sur
le GPU (deux couches : dense autour de Noa, plus légère au loin), vent en rafales, brins qui
s'écartent autour des personnages et des créatures ; Noa laisse une **trace couchée qui se
redresse en quelques secondes** ; le souffle du vol plaque l'herbe en cercle.

Code : `world/terrain.js` (relief, lac, rivière, chemins), `world/wilds.js` (monde),
`world/wildsTextures.js`, `world/grass.js`, `story/wildsStory.js` (cycle, villageois, stèles,
Sceaux), `data/wilds.js` (quêtes, Mémoires, dialogues). Test : `node tests/wilds.mjs`.
Captures : `node scripts/wildsviews.mjs <dossier> <qualité> morning,evening,night`.

## Lancer
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build de production dans dist/
npm test           # tests unitaires (inventaire, butin, missions, sauvegarde…)
npm run test:browser   # test de bout en bout de l'ancienne campagne (ville)
node tests/wilds.mjs   # test de bout en bout du monde ouvert
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

## Rendu réaliste (v1.6 « Ultra »)
Tout le décor passe d'un ombrage cartoon à un **rendu physique** :
- **Matériaux PBR** (`src/game/fx/pbr.js`) : `toon()` et `M()` produisent désormais des
  `MeshStandardMaterial` (rugosité / métal par type de surface : asphalte, béton, enduit, verre,
  métal, végétation, eau…). Un shader de détail en coordonnées monde ajoute variations d'albédo
  et de rugosité, micro-relief, crasse au pied des murs, et **la pluie** : surfaces assombries,
  **flaques miroir** et **ondes d'impact des gouttes**. Les couleurs saturées héritées sont
  ramenées à des teintes crédibles ; textures procédurales refaites (asphalte à granulats,
  fissures et taches d'huile, dalles de béton, façades vitrées avec intérieurs éclairés).
- **Ciel physique** (`src/game/world/sky.js`) : diffusion atmosphérique Rayleigh + Mie
  (couchers de soleil exacts selon la hauteur du soleil), précalculée dans une petite table
  (recalculée seulement quand l'heure change), disque solaire, **lune détaillée** (mers,
  cratères, halo), étoiles scintillantes, Voie lactée, pollution lumineuse, **nuages
  procéduraux** éclairés (liseré argenté, dessous éclairé par la ville la nuit), aurore
  abyssale et lueur de la faille. Le même ciel génère l'**éclairage d'environnement (IBL)**
  et la couleur de la brume ; la lumière directionnelle (ombres) suit le soleil puis la lune.
- **Post-traitement** (`src/game/fx/cinematic.js`, `grade.js`) : scène HDR avec **MSAA**,
  **occlusion ambiante (SSAO)**, **réflexions écran sur sol mouillé (SSR)**, **rayons
  crépusculaires**, halo du soleil dans la brume, **flou de mouvement** de caméra, bloom,
  tonalité **ACES**, puis étalonnage film (virage couleur, netteté adaptative, aberration
  d'objectif, vignettage, grain argentique, tramage). Exposition adaptée jour / nuit.
- **Qualité** (menu pause) : *Basse* (téléphones : PBR simple, pas de post-traitement lourd),
  *Moyenne* (SSAO, rayons), *Élevée* (+ réflexions, flou de mouvement), **Ultra (cinéma)**
  (ombres 4096, SSAO pleine résolution, réflexions et rayons plus fins, plus de lumières).
- **Végétation et véhicules (v1.7)** : arbres faits de cartes de feuilles découpées
  (`src/game/world/foliage.js`, feuillus et conifères, ombres découpées, **vent** dans le
  shader), voitures à silhouette de berline extrudée (capot, pare-brise incliné, toit, coffre)
  en **peinture métallisée vernie**, vitres sombres réfléchissantes, teintes de carrosserie
  réelles ; arêtes des décors nettement moins arrondies.
- Contrôle visuel : `node scripts/fxviews.mjs <dossier> <qualité> night,morning,evening`,
  `scripts/fxprobe.mjs` (effets désactivés un par un), `scripts/fxinside.mjs` (intérieurs).

## Personnages réalistes (v1.5)
Tous les personnages humains et deux créatures sont désormais des **modèles réalistes riggués**
animés par **capture de mouvement** (squelette Mixamo commun) : Noa, Inès, Camille, Malik, Théo,
M. Delcourt, Mara, les passants, le Stalker et la Brute. Locomotion fondue selon la vitesse
(repos / marche / course / sprint, cadence calée pour que les pieds ne glissent pas), coups de
poing, crochet, fouet, rafale, roulade, garde, impacts, mort, vol, assis, discussion, téléphone,
salut… Les animations d'attaque sont synchronisées sur le timing du combat. Forme Abysse : le
même corps recouvert d'un vernis noir à reflets cyan, yeux lumineux et tentacules.
- Code : `src/game/actors/realModel.js` (chargement, mélangeur, créatures), `realCast.js` (casting
  et correspondance animations ↔ clips). Repli automatique sur les modèles procéduraux si les
  fichiers manquent.
- Ressources : `public/assets/characters/*.glb` (≈ 15 Mo, textures WebP, maillages compressés),
  reconstruites par `node scripts/realistic/build.mjs` à partir des sources (non versionnées).
- **Licence** : modèles et animations issus de la bibliothèque **Mixamo** (Adobe), récupérés via un
  jeu de données public. Mixamo autorise leur usage gratuit dans des jeux, y compris commerciaux,
  mais pas leur redistribution en tant que fichiers bruts. Avant une diffusion publique, il faut
  re-télécharger les mêmes personnages/animations sur mixamo.com avec un compte Adobe (gratuit)
  et relancer le script de construction.

## Refonte v1.4 « Néon abyssal »
**Interface** : écran titre animé (skyline en parallaxe, lune fendue par la faille, braises,
anneaux en orbite, logo à reflet), boutons biseautés à reflet lumineux, HUD redessiné
(portrait de Noa avec anneau de vie, barres segmentées, capacités en hexagones néon),
**minicarte** orientée caméra (créatures, élites, caisses, failles, amis, objectif),
**carte du monde** (M / bouton 🗺), compteur de **rang de style** (D → SS), marqueur
d'impact, chiffres de dégâts et **coups critiques**, menus en verre sombre, curseurs et
interrupteurs personnalisés (`src/game/ui/refonte.css`, `ui/minimap.js`, `src/title/titleBg.js`).

**Visuels** : contours cartoon sur le héros, la Forme Abysse et toutes les créatures
(`fx/outline.js`), tenue de justicier la nuit (masque à lentilles lumineuses + écharpe qui
flotte avec la vitesse et en vol), étirement/écrasement à l'atterrissage, **traînées** de coups
colorées selon le noyau, **images rémanentes** en esquive et en boost (`fx/trails.js`),
écrasement des créatures à l'impact, étalonnage final (vignette, aberration chromatique au
coup reçu, voile rouge en danger, teinte Abysse — `fx/grade.js`), aurore abyssale dans le
ciel, néons sur les toits et balises clignotantes (`world/skyline.js`).

**IA et logique** :
- **Veilleur** (nouvelle créature, `enemyModels.js`) : spectre flottant qui garde ses
  distances, vise (orbe télégraphié) et tire des orbes guidés ; se téléporte quand on
  l'approche. Les orbes s'esquivent, se bloquent, et une **parade les renvoie** sur les
  créatures (`systems/projectiles.js`).
- **Élites** (quartiers, failles) : Enragée, Blindée ou Spectrale (téléportation), aura,
  santé ×1,8, butin doublé + Abyss Shards.
- **Directeur d'escouade** : les créatures en alerte se répartissent autour de Noa pour
  l'encercler ; elles peuvent **esquiver** les coups lourds et la rafale ; la Brute entre en
  **rage** sous 35 % et rameute les siens.
- **Failles instables** (`systems/rifts.js`) : la nuit, une colonne de lumière s'ouvre dans
  Vesper ; s'en approcher déclenche 3 vagues, puis une récompense (XP, Credits, Shards).
- **Rang de style** (`systems/combo.js`) : varier les attaques fait monter le rang ; être
  touché le fait chuter ; bonus d'XP à la fin de chaque enchaînement.

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
K compétences · L relations · M carte · Échap pause. Manette standard prise en charge
(RT magnétisme, croix droite Forme Abysse).
