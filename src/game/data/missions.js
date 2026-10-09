// Missions et chapitres. Les cibles (`target`) sont des points nommés du monde
// ou des personnages. `requires` : la mission démarre quand l'autre est terminée.
// Types d'étapes : reach (atteindre), talk (parler), interact, kill, event.
export const MISSIONS = {
  // ---------- Prologue : un ado sans pouvoirs ----------
  p01_after_school: {
    kind: 'story',
    title: 'Après les cours',
    intro: "17 h 42, lycée Vesper-Nord. Noa Vant, 16 ans, sort du dernier cours de la journée. Sa mère est infirmière de nuit ; depuis la mort de son père, il rentre souvent seul.",
    autoStart: true,
    steps: [
      { type: 'talk', target: 'ines', text: 'Parler à Inès devant le lycée' },
      { type: 'reach', target: 'rally', radius: 6, text: 'Rentrer à la maison par la place Halden' },
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
      { type: 'interact', target: 'aegis_case', text: 'Une lueur dans la camionnette Aegis… s’en approcher' },
    ],
    reward: {},
  },
  p03_rings: {
    kind: 'story',
    title: 'Le réveil',
    intro: "Des anneaux de métal flottent autour des bras de Noa. Ils répondent à sa peur, à sa colère… à sa volonté.",
    requires: 'p02_nightfall',
    steps: [
      { type: 'kill', group: 'chaser', count: 1, text: 'Repousser la créature avec les anneaux [Clic gauche / Clic droit]' },
      { type: 'event', id: 'volley', text: 'Lancer une rafale d’anneaux [F]' },
      { type: 'event', id: 'shield', text: 'Lever le bouclier d’anneaux [G maintenu]' },
      { type: 'event', id: 'flight', text: 'Les anneaux te soulèvent… S’envoler [V]' },
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
