# Consigne pour la session suivante (copier-coller dans un nouveau Claude Code)

Tu reprends le développement de **NIGHTFALL: Rise of the Abyss** (studio SuperEssence),
dépôt `julienots/nightfall`, branche `ccr-156b91b0-x98l9l` (travaille sur cette branche,
commit + push, pas de PR sans demande). Jeu 3D cartoon (Three.js 0.169 + Vite), APK Android
via Capacitor 7. Code, commentaires et textes en jeu **en français**. Lis d'abord `README.md`.

## Règles du projet
- Ne supprime jamais arbitrairement des fichiers, musiques ou assets existants.
- Chaque bouton et chaque amélioration doivent avoir un vrai effet. Pas de faux paiement.
- Aucune copie d'une licence protégée : on peut s'inspirer d'un genre (aimants façon « Magneto »,
  symbiote façon « Venom »), jamais copier noms, logos ou designs exacts.
- Teste pour de vrai et ne prétends jamais qu'un test ou un build a eu lieu s'il n'a pas eu lieu.
- Fin de chaque étape : `npm test`, `node tests/smoke.mjs <dossier>` (long, rendu logiciel
  lent : lance-le en arrière-plan), `node tests/touch.mjs <dossier>`, puis l'APK :
  `npx vite build && npx cap sync android && cd android && ANDROID_HOME=/home/user/android-sdk ./gradlew assembleDebug --no-daemon -q --max-workers=2`
  (incrémente `versionCode` / `versionName` dans `android/app/build.gradle`), copie l'APK dans
  `exports/` et envoie-le à l'utilisateur.

## État actuel (v1.4)
Tout ce qui était listé en v1.3 est en place (monde ouvert, intérieurs, jour/nuit, social,
magnétisme, Forme Abysse, histoire jusqu'au chapitre 2). Ajouté en v1.4 :
- **Dialogues tactiles réparés** : la couche tactile (`.touch-ui`, plein écran) passait
  au-dessus du HUD et avalait les appuis ; HUD en z-index 6, couche tactile en
  `pointer-events: none` sauf ses enfants. Test réel dans `tests/touch.mjs`.
- **Rendu plus net** : MSAA ×4 dans le composeur (moyenne/élevée), FXAA en basse,
  définition plus haute, résolution dynamique (`Game.#adaptResolution`).
- **Mission « Casier 117 »** (`data/bully.js`, `story.js` : `#bullyTalk`, `#cpeTalk`,
  `#populateBully`) : Jordan et sa bande, Inès, Mme Ferrand (CPE), médiation ; tentation des
  pouvoirs avec conséquences ; Jordan devient un allié (`CHARACTERS.jordan`, masqué du menu
  Relations tant qu'on ne l'a pas rencontré). Test : `node tests/bully.mjs`.
- **Foule** : 1 à 3 passants par itinéraire selon la qualité, joggeurs à l'étang, groupes
  qui discutent, élèves qui circulent dans le lycée ; distance de masquage `game.npcFar`.
- **Manette Xbox** : glyphes dans les invites et les choix, B ferme les menus, page
  « Commandes manette » dans la pause.
- **Effets de combat** : traînées (`fx.swoosh`), impacts par noyau (`fx.coreImpact` : ambre,
  Éclipse = arcs `fx.bolt`, Vide = implosion), griffes et encre de l'Abysse, champ
  magnétique visible, poses de coups avec élan et prolongement.

## APK
Le SDK Android n'est pas téléchargeable depuis l'environnement cloud (dl.google.com bloqué).
L'APK est donc construit par **GitHub Actions** (`.github/workflows/apk.yml`) à chaque push
sur la branche : il est publié en « release » (pré-version) `vX.Y-buildN` téléchargeable
depuis le téléphone. Incrémenter `versionCode` / `versionName` dans
`android/app/build.gradle` avant de pousser.

## À FAIRE (par priorité)
1. Construire et envoyer l'APK v1.4 (voir ci-dessus), tester sur téléphone les dialogues
   tactiles et la fluidité (résolution dynamique).
2. Menus à la manette : la croix déplace la sélection et A valide (fait en v1.4.1) ; les
   curseurs (volume…) ne se règlent pas encore à la manette.
3. Chapitre 2 « Blackwood » (labos d'Aegis, Hollis, Lucas le frère de Théo), nouvelles
   créatures et boss. La vidéo des pouvoirs (flag `bully_powers2`) peut attirer Aegis.
4. Cadrage caméra des conversations dans les petites pièces (CDI) parfois trop serré.
