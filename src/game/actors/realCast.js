// Distribution des personnages réalistes et correspondance entre les
// animations du jeu et les clips de capture de mouvement (squelette Mixamo
// commun : toutes les animations s'appliquent à tous les personnages).
// Partagé par le jeu et par scripts/realistic/build.mjs.

// id -> source, hauteur visée (m), taux de simplification, taille de texture.
export const CAST = {
  noa: { src: 'Leonard', height: 1.74, ratio: 0.6, tex: 1024 },
  ines: { src: 'Sophie', height: 1.66, ratio: 0.45, tex: 1024 },
  camille: { src: 'Megan', height: 1.68, ratio: 0.45, tex: 1024 },
  malik: { src: 'James', height: 1.8, ratio: 0.45, tex: 1024 },
  theo: { src: 'Brian', height: 1.7, ratio: 0.45, tex: 1024 },
  delcourt: { src: 'Joe', height: 1.8, ratio: 0.4, tex: 1024 },
  mara: { src: 'Jennifer', height: 1.75, ratio: 0.45, tex: 1024 },
  // Passants (plus légers)
  p_jody: { src: 'Jody', height: 1.7, ratio: 0.25, tex: 512 },
  p_bryce: { src: 'Bryce', height: 1.8, ratio: 0.25, tex: 512 },
  p_louise: { src: 'Louise', height: 1.7, ratio: 0.25, tex: 512 },
  p_martha: { src: 'Martha', height: 1.68, ratio: 0.25, tex: 512 },
  p_remy: { src: 'Remy', height: 1.78, ratio: 0.3, tex: 512 },
  // Créatures
  stalker: { src: 'Parasite_L_Starkie', height: 2.2, ratio: 0.7, tex: 1024 },
  brute: { src: 'Mutant', height: 3.0, ratio: 0.8, tex: 1024 },
};

// Palettes historiques (HeroModel) -> personnage réaliste.
export const PALETTE_TO_CAST = { noa: 'noa', ines: 'ines', camille: 'camille', malik: 'malik', theo: 'theo', delcourt: 'delcourt', mara: 'mara' };
export const CROWD = ['p_jody', 'p_bryce', 'p_louise', 'p_martha', 'p_remy', 'theo', 'camille'];
// Élèves du lycée (visages jeunes).
export const STUDENTS = ['theo', 'camille', 'p_remy', 'p_jody', 'p_bryce', 'p_louise'];

// Clé du jeu -> clip Mixamo.
export const CLIPS = {
  // Locomotion
  idle: 'Idle', fightIdle: 'Fight_Idle', walk: 'Walking', run: 'Running', sprint: 'Sprint',
  fall: 'Falling', land: 'Landing', float: 'Floating', roll: 'Dive_Roll',
  block: 'Standing_Block_Idle', blockHit: 'Standing_Block_React_Large',
  hitSmall: 'Standing_React_Small_From_Front', hitLarge: 'Standing_React_Large_From_Front',
  death: 'Dying', getUp: 'Getting_Up',
  // Attaques (anneaux)
  jabR: 'Lead_Jab', jabL: 'Cross_Punch', ringPunch: 'Hook_Punch', whip: 'Standing_1H_Magic_Attack_03',
  volley: 'Standing_2H_Magic_Attack_01', diveImpact: 'Jump_Attack', superLanding: 'Fall_B_Land_To_Standing_Idle',
  kick: 'Roundhouse_Kick', flyingKick: 'Flying_Kick',
  // Vie quotidienne / histoire
  interact: 'Picking_Up_Object', victory: 'Victory', phone: 'Texting_While_Standing', scared: 'Terrified',
  awaken: 'Standing_2H_Cast_Spell_01', magnetLift: 'Standing_2H_Cast_Spell_01', magnetHold: 'Standing_2H_Cast_Spell_01',
  magnetThrow: 'Throw_Object', sit: 'Sitting_Idle', talk: 'Talking', wave: 'Waving', shy: 'Look_Away_Gesture', hug: 'Kiss',
  happy: 'Happy_Idle', lookAround: 'Look_Around',
  // Forme Abysse
  transform: 'Mutant_Roaring', roar: 'Mutant_Roaring', clawR: 'Mutant_Swiping', clawL: 'Mutant_Punch', smash: 'Mutant_Jump_Attack',
  lash: 'Zombie_Attack', umbraIdle: 'Mutant_Breathing_Idle', umbraRun: 'Mutant_Run',
  // Créatures
  mIdle: 'Mutant_Idle', mRun: 'Mutant_Run', mRoar: 'Mutant_Roaring', mSwipe: 'Mutant_Swiping', mJump: 'Mutant_Jump_Attack',
  mFlex: 'Mutant_Flexing_Muscles', mDie: 'Mutant_Dying', mBreath: 'Mutant_Breathing_Idle',
  zIdle: 'Zombie_Idle', zRun: 'Zombie_Running', zAttack: 'Zombie_Attack', zDie: 'Zombie_Dying', zStumble: 'Zombie_Stumbling',
};

// Animations jouées en boucle (les autres sont pilotées par leur progression).
export const LOOPS = new Set(['idle', 'fightIdle', 'walk', 'run', 'sprint', 'fall', 'float', 'block', 'sit', 'talk', 'phone', 'magnetHold',
  'happy', 'lookAround', 'umbraIdle', 'umbraRun', 'mIdle', 'mRun', 'mBreath', 'zIdle', 'zRun', 'scared', 'shy']);
