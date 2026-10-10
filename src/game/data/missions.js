// Missions et chapitres. Les cibles (`target`) sont des points nommés du monde
// ou des personnages. `requires` : la mission démarre quand l'autre est terminée.
// Types d'étapes : reach (atteindre), talk (parler), interact, kill, event.
export const MISSIONS = {
  // ---------- Prologue : un ado sans pouvoirs ----------
  p01_after_school: {
    kind: 'story',
    title: 'Après les cours',
    intro: "16 h 55, lycée Vesper-Nord. Noa Vant, 16 ans, somnole au dernier rang du cours de physique. Sa mère est infirmière de nuit ; depuis la mort de son père, il rentre souvent seul.",
    autoStart: true,
    steps: [
      { type: 'event', id: 'class_over', text: 'Suivre le cours de M. Delcourt' },
      { type: 'talk', target: 'malik', text: 'Retrouver Malik dans le couloir' },
      { type: 'interact', target: 'locker', text: 'Récupérer ton sac au casier 117' },
      { type: 'talk', target: 'ines', text: 'Rejoindre Inès devant le lycée' },
      { type: 'reach', target: 'rally', radius: 6, text: 'Rentrer à la maison en passant par la place Halden' },
    ],
    reward: {},
  },
  p02_nightfall: {
    kind: 'story',
    title: 'La nuit tombe',
    intro: "Le ciel s'est déchiré au-dessus de Vesper. Les lumières se sont éteintes. Et quelque chose est sorti de l'ombre.",
    requires: 'p01_after_school',
    steps: [
      { type: 'reach', target: 'parking_entry', radius: 6, text: 'Fuir ! Courir vers le parking Halden' },
      { type: 'interact', target: 'aegis_case', text: 'Le même cristal qu’au labo brille dans la camionnette Aegis…' },
    ],
    reward: {},
  },
  p03_rings: {
    kind: 'story',
    title: 'Le réveil',
    intro: "Le cristal s'est dissous dans le bras de Noa. Tout le métal autour de lui lui obéit désormais : il en a forgé dix anneaux.",
    requires: 'p02_nightfall',
    steps: [
      { type: 'kill', group: 'chaser', count: 1, text: 'Repousser la créature avec les anneaux [Clic gauche / Clic droit]' },
      { type: 'event', id: 'volley', text: 'Lancer une rafale d’anneaux [F]' },
      { type: 'event', id: 'shield', text: 'Lever le bouclier d’anneaux [G maintenu]' },
      { type: 'event', id: 'magnet_throw', text: 'Magnétisme : soulever une voiture [X] puis la lancer [X]' },
      { type: 'event', id: 'flight', text: 'Le métal te soulève… S’envoler [V]' },
      { type: 'reach', target: 'lumen_roof', radius: 8, text: 'Voler jusqu’au toit de l’hôtel Lumen' },
    ],
    reward: { xp: 200 },
  },

  // ---------- Chapitre 1 : Vesper Downtown ----------
  m01_first_contact: {
    kind: 'main',
    title: 'Premier contact',
    intro: "Une inconnue, Mara, a piraté la radio de ton téléphone. Elle a tout vu. Elle dit que des créatures sortent d'une faille dans le parking Halden.",
    requires: 'p03_rings',
    steps: [
      { type: 'kill', group: 'parking', count: 4, text: 'Nettoyer le parking Halden' },
      { type: 'interact', target: 'crate_tactical_1', text: 'Ouvrir la caisse Aegis du parking' },
      { type: 'reach', target: 'safehouse', radius: 5, text: 'Rejoindre le refuge de Mara' },
    ],
    reward: { xp: 300, credits: 200, shards: 5, items: [{ id: 'medkit', qty: 2 }] },
  },
  m02_aegis_echo: {
    kind: 'main',
    title: 'L’écho d’Aegis',
    intro: "Mara a capté un signal Aegis dans la ruelle derrière Nova Market. Une boucle audio. Elle ressemble à la voix de ton père.",
    requires: 'm01_first_contact',
    steps: [
      { type: 'reach', target: 'nova_alley', radius: 6, text: 'Suivre le signal dans la ruelle Nova' },
      { type: 'kill', group: 'crawlers', count: 3, text: 'Survivre à l’embuscade des Crawlers' },
      { type: 'interact', target: 'aegis_drone', text: 'Récupérer l’enregistrement du drone Aegis' },
      { type: 'reach', target: 'safehouse', radius: 5, text: 'Rapporter l’enregistrement à Mara' },
    ],
    reward: { xp: 350, credits: 250, items: [{ id: 'medkit', qty: 1 }] },
  },
  m03_colossus: {
    kind: 'main',
    title: 'Le Colosse',
    intro: "La faille de la place Halden s'élargit. Quelque chose d'immense essaie d'en sortir. Et tout le quartier est encore dans son rayon.",
    requires: 'm02_aegis_echo',
    steps: [
      { type: 'reach', target: 'rally', radius: 12, text: 'Rejoindre la place Halden' },
      { type: 'kill', group: 'colossus', count: 1, text: 'Vaincre le Colosse' },
      { type: 'interact', target: 'boss_cache', text: 'Ouvrir la cache du Colosse' },
    ],
    reward: { xp: 800, credits: 600, shards: 15 },
  },
  m04_umbra: {
    kind: 'main',
    title: 'L’Ombre',
    intro: "Là où le Colosse s'est effondré, une flaque noire refuse de s'évaporer. Elle tremble quand Noa approche. Comme si elle le reconnaissait.",
    requires: 'm03_colossus',
    steps: [
      { type: 'interact', target: 'abyss_ooze', text: 'Examiner la substance noire sur la place Halden' },
      { type: 'event', id: 'transform', text: 'Laisser l’Ombre sortir [T]' },
      { type: 'kill', group: 'umbra_test', count: 4, text: 'Maîtriser la Forme Abysse face aux créatures' },
      { type: 'reach', target: 'home_door', radius: 4, text: 'Rentrer chez toi, aux Tilleuls (au sud)' },
    ],
    reward: { xp: 500, credits: 300, shards: 10 },
  },

  // ---------- Chapitre 2 : Double vie ----------
  d01_double_life: {
    kind: 'story',
    title: 'Double vie',
    intro: "Le lendemain. Vesper panse ses plaies, mais les cours reprennent. Personne ne doit savoir que le garçon volant d'Halden est assis au troisième rang.",
    requires: 'm04_umbra',
    steps: [
      { type: 'event', id: 'enter_school', text: 'Aller au lycée Vesper-Nord (à l’est)' },
      { type: 'talk', target: 'ines', text: 'Inès t’attend à la cafétéria' },
      { type: 'event', id: 'lesson', text: 'Assister au cours de physique (ta place au labo)' },
      { type: 'talk', target: 'camille', text: 'Camille veut te voir à l’étang du parc (ouest)' },
      { type: 'event', id: 'night', text: 'Rentrer chez toi et attendre la nuit (lit)' },
    ],
    reward: { xp: 300, credits: 150 },
  },
  n01_night_watch: {
    kind: 'contract',
    title: 'Ronde de nuit',
    intro: 'Mara : « Depuis le Colosse, les failles s’ouvrent dans tous les quartiers. Le parc, le port, les Tilleuls… Fais une ronde. »',
    requires: 'd01_double_life',
    steps: [{ type: 'kill', count: 8, text: 'Éliminer des créatures dans la ville (la nuit)' }],
    reward: { xp: 400, credits: 350, shards: 8 },
  },
  s02_lucas: {
    kind: 'side',
    title: 'Le frère de Théo',
    intro: 'Lucas, le frère de Théo, était vigile chez Aegis. Il a disparu la nuit du Nightfall. La tour Aegis, au nord, est le dernier endroit où il a été vu.',
    requires: 'd01_double_life',
    steps: [
      { type: 'talk', target: 'theo', text: 'Parler à Théo (au stade du lycée l’après-midi, dans le hall le matin)' },
      { type: 'reach', target: 'aegis_tower', radius: 14, text: 'Inspecter les abords de la tour Aegis (nord)' },
    ],
    reward: { xp: 250, credits: 120 },
  },
  s01_rooftop_signal: {
    kind: 'side',
    title: 'Le signal du toit',
    intro: "Un émetteur Aegis clignote sur le toit de l'immeuble Corvin. On peut y grimper par la ruelle… ou y voler.",
    requires: 'p03_rings',
    steps: [
      { type: 'reach', target: 'rooftop_beacon', radius: 4, text: "Atteindre le toit de l'immeuble Corvin" },
      { type: 'interact', target: 'crate_elite_roof', text: "Récupérer la caisse d'élite" },
    ],
    reward: { xp: 180, credits: 120 },
  },
  c01_stalker_hunt: {
    kind: 'contract',
    title: 'Contrat : Rôdeurs',
    intro: 'Les survivants paient pour chaque Stalker abattu dans le quartier.',
    requires: 'p03_rings',
    steps: [{ type: 'kill', enemyType: 'stalker', count: 5, text: 'Éliminer des Stalkers' }],
    reward: { xp: 150, credits: 160 },
  },
};

export const MISSION_KIND_LABEL = { story: 'Histoire', main: 'Principale', side: 'Secondaire', contract: 'Contrat de chasse' };
