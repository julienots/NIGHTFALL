// Missions du vertical slice (Vesper Downtown). Les cibles (`target`) sont des
// points nommés définis par le monde (voir world/downtown.js).
export const MISSIONS = {
  m01_first_contact: {
    kind: 'main',
    title: 'Premier contact',
    intro: "Des cris ont été signalés près du parking Halden. Allez voir ce qui s'y passe.",
    autoStart: true,
    steps: [
      { type: 'reach', target: 'rally', radius: 7, text: 'Rejoindre la place Halden' },
      { type: 'kill', group: 'parking', count: 4, text: 'Éliminer les créatures du parking' },
      { type: 'interact', target: 'crate_tactical_1', text: 'Ouvrir la caisse tactique' },
      { type: 'reach', target: 'safehouse', radius: 5, text: 'Retourner au refuge' },
    ],
    reward: { xp: 300, credits: 200, shards: 5, items: [{ id: 'medkit', qty: 2 }] },
  },
  s01_rooftop_signal: {
    kind: 'side',
    title: 'Le signal du toit',
    intro: "Un émetteur clignote sur le toit de l'immeuble Corvin. Les conteneurs de la ruelle devraient permettre d'y grimper.",
    autoStart: true,
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
    autoStart: true,
    steps: [{ type: 'kill', enemyType: 'stalker', count: 5, text: 'Éliminer des Stalkers' }],
    reward: { xp: 150, credits: 160 },
  },
};

export const MISSION_KIND_LABEL = { main: 'Principale', side: 'Secondaire', contract: 'Contrat de chasse' };
