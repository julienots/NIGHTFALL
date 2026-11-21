// LES MARCHES DE VESPER — quêtes et lore du monde ouvert.
// Rien n'est imposé : seule la première quête montre le chemin ; ensuite les
// trois Sceaux se font dans l'ordre qu'on veut, les quêtes des villages et les
// Mémoires (stèles) se découvrent en explorant.

export const WILDS_MISSIONS = {
  w01_reveil: {
    world: 'wilds',
    kind: 'story',
    title: 'Le Porte-Anneaux',
    intro: "Tu t'éveilles au milieu de colonnes brisées, dix anneaux de métal d'étoile soudés à tes avant-bras. Tu ne te souviens que d'un nom : Noa. Au loin, une colonne de lumière violette fend le ciel du nord.",
    autoStart: true,
    steps: [
      { type: 'interact', target: 'stele_0', text: 'Lire la stèle du Sanctuaire' },
      { type: 'reach', target: 'brumeval', radius: 18, text: 'Descendre au village de Brumeval' },
      { type: 'talk', target: 'aldric', text: 'Parler à Aldric, l’ancien du village' },
    ],
    reward: { xp: 150, credits: 40 },
  },
  w02_aube: {
    world: 'wilds',
    kind: 'main',
    title: 'Le Sceau de l’Aube',
    intro: "Sur la colline à l'est du Sanctuaire, le premier Sceau saigne une lumière rouge. Les Rôdeurs s'y nourrissent.",
    requires: 'w01_reveil',
    steps: [
      { type: 'kill', group: 'seal_aube', count: 3, text: 'Chasser les Rôdeurs du Sceau de l’Aube' },
      { type: 'interact', target: 'seal_aube', text: 'Poser les anneaux sur l’obélisque' },
    ],
    reward: { xp: 300, credits: 80, shards: 4 },
  },
  w03_marees: {
    world: 'wilds',
    kind: 'main',
    title: 'Le Sceau des Marées',
    intro: "Au nord du lac des Saules, sur un promontoire battu par le vent, le deuxième Sceau. Une Brute y monte la garde.",
    requires: 'w01_reveil',
    steps: [
      { type: 'kill', group: 'seal_marees', count: 3, text: 'Vaincre les gardiens du Sceau des Marées' },
      { type: 'interact', target: 'seal_marees', text: 'Ranimer le Sceau des Marées' },
    ],
    reward: { xp: 350, credits: 90, shards: 5 },
  },
  w04_cendres: {
    world: 'wilds',
    kind: 'main',
    title: 'Le Sceau des Cendres',
    intro: "Au cœur de la forêt de pins, au sud de Cendreval, le troisième Sceau. Les charbonniers n'osent plus y aller.",
    requires: 'w01_reveil',
    steps: [
      { type: 'kill', group: 'seal_cendres', count: 4, text: 'Purger le Sceau des Cendres' },
      { type: 'interact', target: 'seal_cendres', text: 'Ranimer le Sceau des Cendres' },
    ],
    reward: { xp: 400, credits: 100, shards: 6 },
  },
  w05_faille: {
    world: 'wilds',
    kind: 'main',
    title: 'La Faille',
    intro: "Les trois Sceaux chantent de nouveau. La Faille, au nord, ne peut plus se refermer seule : quelque chose de colossal la garde.",
    requiresAll: ['w02_aube', 'w03_marees', 'w04_cendres'],
    steps: [
      { type: 'reach', target: 'faille', radius: 22, text: 'Marcher jusqu’à la Faille' },
      { type: 'kill', group: 'colossus', count: 1, text: 'Abattre le Colosse de l’Abysse' },
      { type: 'interact', target: 'faille_heart', text: 'Sceller le cœur de la Faille' },
    ],
    reward: { xp: 1000, credits: 300, shards: 15 },
  },
  // ---------- Quêtes des villages ----------
  ws_loups: {
    world: 'wilds',
    kind: 'side',
    title: 'Les loups d’ombre',
    intro: "Bran, le chasseur de Cendreval : « Des bêtes noires rôdent la nuit à l'est du village. Elles ont pris trois chèvres et le chien des Morvan. »",
    steps: [
      { type: 'kill', group: 'loups', count: 4, text: 'Abattre les Rôdeurs à l’est de Cendreval (la nuit)' },
      { type: 'talk', target: 'bran', text: 'Revenir voir Bran' },
    ],
    reward: { xp: 250, credits: 120, items: [{ id: 'medkit', qty: 2 }] },
  },
  ws_fleur: {
    world: 'wilds',
    kind: 'side',
    title: 'La fleur de lune',
    intro: "Maëlle, la guérisseuse de Port-Saule, cherche une fleur de lune pour soigner sa fille. Il en pousse une, dit-on, près de la vieille tour de guet.",
    steps: [
      { type: 'interact', target: 'fleur_lune', text: 'Cueillir la fleur de lune près de la tour de guet' },
      { type: 'talk', target: 'maelle', text: 'Rapporter la fleur à Maëlle, à Port-Saule' },
    ],
    reward: { xp: 220, credits: 60, items: [{ id: 'medkit', qty: 3 }] },
  },
  ws_memoires: {
    world: 'wilds',
    kind: 'side',
    title: 'Les Mémoires des Veilleurs',
    intro: "Huit stèles runiques sont dispersées dans les Marches. Chacune garde un fragment de ce qui s'est passé il y a mille ans.",
    requires: 'w01_reveil',
    steps: [{ type: 'collect', item: 'memoire', count: 7, text: 'Lire les stèles des Veilleurs' }],
    reward: { xp: 500, shards: 10 },
  },
};

// Les Mémoires : l'histoire de la chute de Vesper, à lire dans le désordre.
export const MEMOIRES = {
  stele_0: {
    title: 'I. Le Serment',
    text: "Nous étions sept, forgés dans le métal tombé du ciel. Nous avons juré de veiller tant que la Nuit dormirait sous Vesper. Si tu lis ceci, Porte-Anneaux, c'est qu'un de nous est revenu. Les anneaux ne choisissent que ceux qui ont déjà prêté serment.",
  },
  stele_1: {
    title: 'II. Le royaume de Vesper',
    text: "Vesper était un royaume de lanternes. Ses rues ne connaissaient pas l'obscurité : la reine Ysolde avait fait allumer mille feux pour que personne n'ait plus jamais peur du noir. Nous aurions dû comprendre qu'on ne chasse pas la Nuit. On la repousse ailleurs.",
  },
  stele_2: {
    title: 'III. Ce qui dort dessous',
    text: "Sous les racines du monde respire l'Abysse. Elle n'est pas mauvaise : elle a faim, comme l'hiver a froid. Elle prend la chaleur, la mémoire, les noms. Ceux qu'elle touche deviennent des Rôdeurs, des silhouettes qui cherchent encore leur maison.",
  },
  stele_3: {
    title: 'IV. La promesse d’Ysolde',
    text: "La reine vieillissait. Une voix lui promit que la Nuit pouvait arrêter le temps. Elle fit creuser au nord, toujours plus profond, jusqu'à ouvrir la Faille. Les lanternes de Vesper s'éteignirent toutes la même nuit. On l'appelle encore le Nightfall.",
  },
  stele_4: {
    title: 'V. Les trois Sceaux',
    text: "Pour refermer la blessure, nous avons dressé trois Sceaux : l'Aube à l'est, les Marées sur le lac, les Cendres dans la forêt. Chacun boit la force d'un Veilleur. Quatre d'entre nous s'y sont endormis pour toujours. Les Sceaux tiendront mille ans. Pas un jour de plus.",
  },
  stele_5: {
    title: 'VI. La forme de l’Abysse',
    text: "Un Veilleur qui accepte l'Abysse en lui devient plus fort que dix. Mais elle parle, la nuit, et elle connaît ton nom. Si la substance noire t'enveloppe, souviens-toi : tu la portes, elle ne te porte pas.",
  },
  stele_6: {
    title: 'VII. Le gardien',
    text: "Ysolde ne mourut pas. L'Abysse la remodela en ce qui garde aujourd'hui la Faille : un colosse de pierre noire et de lumière, qui se souvient d'avoir été reine. Si tu la croises, ne la hais pas. Libère-la.",
  },
  stele_7: {
    title: 'VIII. Le dernier Veilleur',
    text: "Je suis le septième. J'ai caché mes anneaux dans le Sanctuaire et je me suis endormi sous la pierre, en espérant qu'à mon réveil quelqu'un se souviendrait de moi. Si tu as lu toutes ces stèles, tu sais maintenant qui tu es. Bon retour, Noa.",
  },
};

// Dialogues des habitants (lignes [qui, texte]).
export const VILLAGERS = {
  aldric: {
    name: 'Aldric',
    role: 'Ancien de Brumeval',
    first: [
      ['Aldric', "Par les sept… Des anneaux d'étoile. On racontait qu'un Veilleur dormait au Sanctuaire, mais je croyais à une histoire pour les enfants."],
      ['Noa', "Je ne me souviens de rien. Juste de mon nom."],
      ['Aldric', "Alors écoute. Les trois Sceaux qui retiennent la Faille se fissurent. Chaque nuit, les Rôdeurs descendent plus près des villages."],
      ['Aldric', "L'Aube à l'est, les Marées au nord du lac, les Cendres dans la forêt. Ranime-les, dans l'ordre que tu veux. Et lis les stèles : elles disent ce que nous avons oublié."],
      ['Aldric', "L'autel bleu, là, garde les voyageurs : prie-y pour te reposer. Et la forge de Tomas renforcera tes anneaux. Que la lumière te garde, Porte-Anneaux."],
    ],
    idle: [
      ["Aldric", "Les gens de Cendreval, à l'ouest, vivent du charbon de la forêt. Ceux de Port-Saule pêchent sur le lac. Va les voir : ils ont besoin d'aide autant que nous."],
      ["Aldric", "La nuit, reste sur les chemins. Les Rôdeurs n'aiment pas les lanternes."],
      ["Aldric", "Chaque Sceau ranimé te rendra un peu de la force des anciens Veilleurs."],
    ],
  },
  bran: {
    name: 'Bran',
    role: 'Chasseur de Cendreval',
    first: [
      ['Bran', "Tu n'es pas d'ici. Ces anneaux… Si tu sais t'en servir, j'ai du travail pour toi."],
      ['Bran', "Des bêtes d'ombre rôdent la nuit à l'est du village, entre les pins. Mes flèches les traversent comme de la fumée."],
      ['Bran', "Débarrasse-nous d'elles et je te paierai bien. Elles ne sortent qu'à la nuit tombée."],
    ],
    done: [['Bran', "Tu les as eues. Toutes. Tiens, ce n'est pas grand-chose, mais Cendreval n'oubliera pas."]],
    idle: [['Bran', "Le Sceau des Cendres est au sud, au fond de la forêt. Personne n'y va plus depuis que le feu bleu est devenu rouge."]],
  },
  maelle: {
    name: 'Maëlle',
    role: 'Guérisseuse de Port-Saule',
    first: [
      ['Maëlle', "Ma fille a été effleurée par un Rôdeur. Depuis, elle a froid, tout le temps. Elle oublie des mots."],
      ['Maëlle', "La fleur de lune peut la soigner. Il en pousse près de la vieille tour de guet, à l'ouest de Brumeval. Elle brille la nuit."],
      ['Maëlle', "Je t'en prie. Je ne peux pas la laisser seule."],
    ],
    done: [['Maëlle', "Elle… elle vient de dire mon nom. Merci. Prends ces remèdes : tu en auras plus besoin que nous."]],
    idle: [['Maëlle', "Le Sceau des Marées est sur le promontoire, au nord du lac. Les pêcheurs entendent des cris la nuit."]],
  },
  tomas: {
    name: 'Tomas',
    role: 'Forgeron de Brumeval',
    idle: [['Tomas', "Du métal d'étoile… Je n'en ai jamais touché. Apporte-moi des éclats d'Abysse et je pourrai renforcer tes anneaux à la forge."]],
  },
  lina: {
    name: 'Lina',
    role: 'Pêcheuse de Port-Saule',
    idle: [['Lina', "Le lac est calme le jour. La nuit, on voit la lumière violette du nord se refléter dessus. Ma grand-mère disait que c'est la reine qui pleure."]],
  },
};
