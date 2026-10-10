# Consigne pour la session suivante (copier-coller dans un nouveau Claude Code)

Tu reprends le développement de **NIGHTFALL: Rise of the Abyss** (studio SuperEssence),
dépôt `julienots/nightfall`, branche `ccr-c181cca6-f5wlrm` (travaille sur cette branche,
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

## État actuel (v1.3 « en cours »)
Déjà en place (voir `src/game/`) :
- **Monde ouvert** : `world/districts.js` (campus du lycée, stade, Les Tilleuls avec la
  maison de Noa, Parc Vesper, industrie, port, tour Aegis, forêt de Blackwood), culling par
  quartier dans `Game.js` (`#cullDistricts`).
- **Intérieurs** : `world/interiors.js` (lycée : hall, couloir, casiers, salles 12/14, labo,
  cafétéria, CDI ; maison : salon, cuisine, chambre). Entrée/sortie avec fondu
  (`Game.enterZone`, `Game.transition`).
- **Jour/nuit** : `Game.setPhase('morning'|'afternoon'|'evening'|'night')`, ciel de jour
  (`setNight(k)` avec k < 0 = jour), créatures seulement la nuit, dormir au lit (story.js).
- **Social** : `systems/social.js` + `data/characters.js` (Inès, Camille, Malik, Théo :
  affinité, scènes à choix, cadeaux, rendez-vous, couple +10 % XP, cours avec quiz).
  Menu Relations (touche L). Boîte de dialogue HUD (`hud.dialog`, choix 1-2-3 / toucher).
- **Magnétisme** : `systems/magnetism.js` (X : soulever/lancer voitures, bennes, barils ;
  en vol : tempête de métal).
- **Forme Abysse** (symbiote original) : `actors/heroModel.js` variante `umbra`,
  `actors/hero.js` (`UMBRA`, touche T, jauge d'Abysse).
- **Histoire** : `story/story.js` (prologue en cours de physique, le cristal Aegis, le
  magnétisme qui forge les anneaux, chapitre 1, mission « L'Ombre », chapitre 2 « Double
  vie »), `data/missions.js`, sélection de chapitre sur l'écran titre (`data/presets.js`).
- Les anneaux restent collés aux avant-bras pendant la course (`actors/rings.js`).

## À FAIRE (par priorité)
1. **Valider l'intégration** : lancer `node tests/smoke.mjs exports/screens` (106
   vérifications) et `tests/touch.mjs`, corriger chaque échec. Regarder les captures
   (quartiers, intérieurs, cours, Forme Abysse) et corriger ce qui est moche ou bloquant
   (personnages coincés dans les murs, portes mal placées, quartiers vides).
2. **Histoire de harcèlement au lycée** (demande explicite) : nouveau personnage harceleur
   (ex. « Jordan » et sa bande) qui vise Noa : casier vandalisé, sac jeté, moqueries dans le
   couloir et à la cafétéria. Mission secondaire en plusieurs jours avec choix (encaisser,
   répondre, en parler à un adulte/à Inès ; utiliser ses pouvoirs = tentation mais risque de
   se trahir → conséquence). Traiter le sujet avec sérieux et sans violence gratuite :
   l'issue positive passe par le courage, les amis et les adultes. Récompenses réelles
   (affinité, XP, déblocage d'une scène de réconciliation ou d'un allié).
3. **Beaucoup plus de monde** : élèves qui se baladent dans le lycée (couloir, cour,
   cafétéria) et passants « lambda » dans tous les quartiers le jour (itinéraires
   `districts.npcRoutes`, `story.#ambient`), groupes qui discutent, joggeurs au parc.
   Garder les performances mobiles : PNJ éloignés non animés/masqués (voir `npc.js`), nombre
   selon la qualité.
4. **Manette Xbox One** propre et cohérente (`core/input.js`, `PADMAP`, mapping « standard ») :
   A sauter / valider dialogue · B roulade / annuler · X coup léger · Y coup lourd ·
   RB pouvoir · LB verrouiller · LT bouclier · RT magnétisme · clic stick gauche courir ·
   clic stick droit voler · croix haut interagir · croix bas soin · croix droite Forme Abysse
   · croix gauche relations · Menu pause · Vue inventaire. Dans les dialogues : X/Y/B =
   choix 1/2/3. Afficher les glyphes manette (Ⓐ Ⓑ Ⓧ Ⓨ) dans les invites quand une manette est
   utilisée, et une page « Commandes manette » dans le menu pause.
5. **Animations de combat et effets d'armes** : poses plus amples et anticipées (élan,
   impact, retour), traînées de mouvement sur les coups, étincelles et ondes de choc
   colorées selon le noyau équipé (couleur `ITEMS[...].visual.glow`), effets propres à
   chaque noyau (ambre = étincelles chaudes, Éclipse = arcs bleus, Vide = distorsion
   violette), meilleurs effets pour la Forme Abysse (griffures, encre noire) et le
   magnétisme (champ visible, débris). Garder le style cartoon.
6. Ensuite : chapitre 2 « Blackwood » (labos d'Aegis, Hollis, Lucas le frère de Théo),
   nouvelles créatures et boss.
