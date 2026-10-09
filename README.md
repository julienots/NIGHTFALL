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

## Histoire (jouable dès la première seconde)
1. **Prologue — Après les cours** : Noa Vant, 16 ans, sort du lycée Vesper-Nord au
   crépuscule. Aucun pouvoir : on marche, on court, on parle à Inès, on reçoit un SMS de
   sa mère (infirmière de nuit). Des passants vivent leur soirée.
2. **La nuit tombe** (cinématique) : le ciel se déchire, coupure de courant, les passants
   fuient, une créature surgit. Noa ne peut pas se battre : il doit fuir.
3. **Le réveil** (cinématique) : dans une camionnette Aegis accidentée — l'entreprise où
   travaillait son père, mort — une mallette libère des anneaux magnétiques qui se lient à lui.
4. **Tutoriel** : combat aux anneaux, rafale, bouclier/parade, puis **vol**.
5. **Chapitre 1** : Mara, une hackeuse, prend contact. Missions, caisses, révélations sur le père.

## Pouvoirs des anneaux (design original, inspiré du genre)
- 10 anneaux chromés (5 par avant-bras) animés individuellement : orbite au repos,
  glissement sur le poing (coups), chaîne en fouet, rafale guidée vers 5 cibles qui revient,
  bouclier tournoyant (parade si levé au dernier moment), propulsion en vol, arcs électriques.
- **Vol** (V) : décollage, vol stationnaire, vol incliné vers où l'on regarde, boost avec
  « bang » d'air (Maj), roulis dans les virages, traînées lumineuses, piqué fracassant,
  atterrissage de super-héros.

## Commandes
ZQSD/WASD déplacer · Maj courir · Espace saut · Ctrl/C rouler · E parler/interagir ·
Clic gauche coups d'anneaux · Clic droit fouet · F rafale · G bouclier · V voler
(en vol : Espace monter, Ctrl descendre, Maj boost, Clic gauche piqué) · R verrouiller ·
H soin · I inventaire · J journal · Échap pause. Manette standard prise en charge.
