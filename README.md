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
   **Casier 117** (mission secondaire, v1.4) : Jordan et sa bande harcèlent Noa (casier
   vandalisé, cafétéria). Choix : encaisser, répondre, en parler à Inès, à Mme Ferrand (la
   CPE), médiation au CDI. Utiliser ses pouvoirs est une tentation qui a un prix (vidéo,
   rumeurs, confiance d'Inès, pas de bonus de courage). Jordan peut devenir un allié.

L'écran titre propose **Chapitres** pour démarrer directement au chapitre 1 ou 2, ou le
**Mode libre** (v1.5) : tous les pouvoirs, la ville en plein jour, une horloge qui tourne
(1 h de jeu = 1 min, cycle jour/nuit continu, créatures la nuit), missions secondaires
ouvertes, sans histoire imposée.

## Mode Créatif, police et héros (v1.7)
- **Mode Créatif** (écran titre › Chapitres) : tous les pouvoirs, niveau 20, crédits
  illimités. **B** (ou 🛠) ouvre le menu de création : créatures (Stalker, Crawler, Brute,
  Colosse, vague), **héros alliés** (Volt, Brasier, Rempart, Spectre), police (1 à 5 ★),
  foule, heure, invincible, énergie/Abysse illimitées, police désactivée.
  **Pouvoirs créatifs** exclusifs (**U** / ✪ lancer, **O** / ⟳ changer) : Singularité (trou
  noir), Chaîne d'éclairs, Gel, Téléportation, Météore.
- **Passants** : on peut les frapper (K.O. cartoon, ils s'enfuient, les autres paniquent).
- **Police** : niveau de recherche 0–5 ★ ; les agents arrivent hors champ, poursuivent,
  interpellent (matraque) et tirent au taser à partir de 3 ★. On s'échappe en se cachant
  (toits, vol, intérieur d'un commerce) : les étoiles retombent une à une.
- **Héros alliés** (IA) : choisissent la créature la plus menaçante, esquivent, enchaînent
  coups et pouvoir spécial, escortent Noa et reviennent en renfort s'ils sont distancés.
- **Vesper-Est / Marina** : la carte s'agrandit à l'est (avenue, immeubles et commerces,
  place, parc, plage, ponton, phare).

## Ville vivante (v1.5)
- **57 portes praticables** (commerces et halls d'immeuble) menant à 5 intérieurs : café
  (chocolat chaud = santé et énergie), supérette (kit de soins), boutique de mode (boutique
  du jeu), salle d'arcade (« Neon Racers » : XP selon le score), hall d'immeuble (repos).
  Personnel et clients à l'intérieur ; on ressort devant la porte d'entrée.
- Foule plus dense, passants qui saluent Noa, téléphonent, discutent en groupe, joggeurs ;
  la Forme Abysse leur fait peur.
- Personnages refaits : tête sculptée, visage détaillé, chevelures modelées, mains à cinq
  doigts, baskets. Les passants utilisent une version allégée (≈ 5 000 triangles).

## Pouvoirs
- **Anneaux** (design original) : 10 anneaux portés sur les avant-bras (ils y restent
  collés même en sprint), coups, fouet, rafale guidée, bouclier/parade, propulsion en vol.
- **Magnétisme** (X) : arracher une voiture, une benne ou un baril du sol, le faire léviter
  au-dessus de soi, le lancer sur une créature (dégâts de zone à l'impact). **En vol**, X
  déclenche la **tempête de métal** : jusqu'à 5 objets proches orbitent puis s'abattent.
- **Vol** (V) : stationnaire, incliné, boost, roulis, piqué, atterrissage de super-héros.
- **Forme Abysse** (T, jauge ≥ 50 %) — v1.6 : transformation progressive (la substance
  part de la poitrine et recouvre tout le corps avec un front de veines cyan, Noa se débat,
  enfle, puis un monstre de 1,7× sa taille surgit en rugissant ; au retour la substance se
  retire). Monstre voûté et musclé. Avant : la substance recouvre Noa (silhouette plus massive,
  yeux cyan, gueule crénelée, tentacules dorsales). Griffes, frappe au sol, tentacules qui
  **attirent** les ennemis, rugissement de zone, bond géant, dégâts subis réduits de moitié,
  se soigne en frappant et se régénère. **Grappin de tentacule** (X / RT) : accroche une
  façade ou un toit jusqu'à 45 m et y tracte Noa. Look « vernis » noir, yeux cyan, crocs,
  cristal Aegis dans la poitrine, veines qui pulsent. La jauge se remplit en combat et se
  vide transformé.

## Relations
Inès (romance), Camille (romance), Malik, Théo (et Jordan, après « Casier 117 ») : affinité 0–100, scènes à choix qui se
débloquent (une conversation par jour), cadeaux préférés, paliers d'amitié (XP, tenue),
rendez-vous puis déclaration ; en couple : +10 % d'expérience. Menu **Relations** (L / ❤).

## Commandes
ZQSD/WASD déplacer · Maj courir · Espace saut · Ctrl/C rouler · E parler/interagir ·
1-2-3 choisir une réponse · Clic gauche coups · Clic droit fouet · F rafale · G bouclier ·
X magnétisme · T Forme Abysse · V voler (en vol : Espace monter, Ctrl descendre, Maj boost,
Clic gauche piqué, X tempête de métal) · R verrouiller · H soin · I inventaire · J journal ·
K compétences · L relations · Échap pause.

**Manette Xbox** : A sauter/valider · B rouler/annuler (ferme les menus) · X coup léger ·
Y coup lourd · RB pouvoir · LB verrouiller · LT bouclier · RT magnétisme · L3 courir ·
R3 voler · croix ↑ interagir · ↓ soin · → Forme Abysse · ← relations · Menu pause · Vue
inventaire. Dialogues : A continuer, X/Y/B réponses 1/2/3. Les invites affichent les
glyphes manette dès qu'elle est utilisée ; page « Commandes manette » dans le menu pause.

## Rendu
Anticrénelage dans la chaîne de post-traitement (MSAA ×4 en qualité moyenne/élevée, FXAA
en basse), définition plus haute qu'avant et **résolution dynamique** : si le téléphone
rame, la définition baisse un peu, puis remonte quand c'est fluide.
