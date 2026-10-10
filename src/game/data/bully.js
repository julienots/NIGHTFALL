// Mission secondaire « Casier 117 » : Jordan et sa bande s'en prennent à Noa.
// Sujet traité sérieusement : pas de violence gratuite, l'issue positive passe
// par le courage, les amis et les adultes. Utiliser ses pouvoirs est une
// tentation… qui a un prix (rumeurs, vidéo, confiance d'Inès).
//
// Chaque scène est une fonction (social, ctx) => nœuds de dialogue (voir
// data/characters.js). ctx : { usePowers() } fourni par l'histoire.

export const BULLY_GANG = 'La bande de Jordan';
export const CPE = 'Mme Ferrand (CPE)';

// Pouvoirs utilisés contre Jordan (0, 1 ou 2 fois).
export const powersUsed = (s) => (s.flags.has('bully_powers') ? 1 : 0) + (s.flags.has('bully_powers2') ? 1 : 0);

export const BULLY_SCENES = {
  // Étape 0 — couloir, devant le casier 117.
  locker: (s, ctx) => [
    ['noa', '(Ton casier est grand ouvert. Ton sac est par terre, tes cahiers trempés. Sur la porte, au marqueur : « L’AIMANT ».)'],
    ['jordan', 'Oh, regardez qui voilà ! L’aimant humain. Tu colles aux frigos aussi, ou juste aux cailloux de Delcourt ?'],
    [BULLY_GANG, '(rires)'],
    ['jordan', 'Allez, ramasse. C’est ta place, ça : par terre.'],
    { do: () => s.flags.add('met_jordan') },
    { prompt: 'Que fais-tu ?', choices: [
      { t: 'Encaisser en silence et ramasser tes affaires.', flag: 'bully_silent', reply: [
        ['jordan', 'C’est ça. Baisse les yeux.'],
        ['noa', '(Ta gorge se serre. Tu te répètes que ce n’est rien. Ce n’est pas rien.)'],
      ] },
      { t: 'Répondre calmement : « T’as fini ? Moi, j’ai cours. »', flag: 'bully_answer', reply: [
        ['jordan', '… Fais le malin. On verra demain, l’aimant.'],
        ['noa', '(Tes mains tremblent un peu. Mais ta voix, elle, n’a pas tremblé.)'],
      ] },
      { t: '(Tentation) Laisser le métal répondre à ta place…', do: () => ctx.usePowers(1), reply: [
        ['noa', '(Tu serres le poing. Le casier de Jordan se referme d’un coup sec, à un centimètre de ses doigts.)'],
        ['jordan', 'C’… c’était quoi, ça ?!'],
        [BULLY_GANG, 'Le casier a claqué tout seul, mec ! T’as vu ?!'],
        ['noa', '(Ton cœur cogne. Trois élèves ont vu. Quelqu’un a sorti son téléphone. Et Jordan ne rit plus : il a peur. De toi.)'],
      ] },
    ] },
    ['jordan', 'On se reverra.'],
    ['noa', '(Ils s’éloignent. Tu restes seul avec ton casier et ce mot sur la porte.)'],
  ],

  // Étape 1 — Inès.
  ines: (s) => [
    ['ines', 'Noa. J’ai vu ton casier. Qui a fait ça ?'],
    { choices: [
      { t: 'C’est Jordan et sa bande. Ça dure depuis la rentrée.', aff: 6, flag: 'bully_told', reply: [
        ['ines', 'Depuis la RENTRÉE ? Et tu ne m’as rien dit ?'],
        ['ines', 'Écoute-moi bien : tu n’as rien fait pour mériter ça. Rien. C’est eux, le problème.'],
      ] },
      { t: 'C’est rien. Une blague.', aff: 1, reply: [
        ['ines', 'Une blague, c’est drôle pour tout le monde. Là, personne ne rit. Surtout pas toi.'],
      ] },
      { t: 'Laisse tomber, je gère tout seul.', reply: [
        ['ines', 'Tout seul… C’est exactement ce qu’ils veulent : que tu sois tout seul.'],
      ] },
    ] },
    ...(s.flags.has('bully_powers') ? [
      ['ines', 'Et… il paraît que le casier de Jordan s’est refermé tout seul. Il y a une vidéo qui tourne. Tu sais quelque chose ?'],
      { choices: [
        { t: 'Un courant d’air. Les casiers sont pourris.', aff: -2, reply: [['ines', 'Un courant d’air. Bien sûr.'], ['noa', '(Elle ne te croit pas. Mentir à Inès, c’est pire que Jordan.)']] },
        { t: 'Je peux pas t’expliquer. Pas maintenant. Mais je ne recommencerai pas.', aff: 2, reply: [['ines', '… D’accord. Pas maintenant. Mais un jour, tu m’expliques.']] },
      ] },
    ] : []),
    ['ines', 'Mme Ferrand, la CPE, elle écoute vraiment. Elle a aidé ma cousine l’an dernier. Et moi, je suis là. Malik aussi, si tu lui en parles.'],
    ['noa', '(Elle a raison. Mais Jordan sera encore là demain.)'],
  ],

  // Étape 2 — le lendemain, à la cafétéria.
  cafeteria: (s, ctx) => {
    const backed = s.flags.has('bully_told') || (s.aff.malik || 0) >= 25;
    return [
      ['jordan', 'Tiens, l’aimant ! T’as faim ?'],
      ['noa', '(Jordan renverse ton plateau. Ton sac glisse sous une table. Toute la cafétéria s’est tue.)'],
      ['jordan', 'Oups. Ça doit être magnétique.'],
      [BULLY_GANG, '(rires)'],
      { prompt: 'Toute la cafétéria te regarde.', choices: [
        { t: 'Te lever et le regarder dans les yeux : « Ça suffit. »', flag: 'bully_stand', reply: [
          ['noa', 'Ça suffit, Jordan. Tout le monde a vu. Et moi, j’en ai fini d’avoir peur de toi.'],
          ...(backed ? [
            ['ines', 'Il a raison. Et on était tous là, Jordan. Tous.'],
            ['malik', 'Ouais. Et j’ai une très bonne mémoire, moi. Surtout pour les plateaux.'],
            { do: () => { s.addAff('ines', 4); s.addAff('malik', 4); } },
          ] : [
            ['noa', '(Personne ne dit rien. Mais une fille de seconde ramasse ton sac et te le tend. Un petit geste. Énorme.)'],
          ]),
          ['jordan', '… Vous êtes pas drôles.'],
        ] },
        { t: 'Ramasser ton sac et quitter la cafétéria.', flag: 'bully_left', reply: [
          ['noa', '(Tu pars. Ce n’est pas de la lâcheté : tu choisis ton moment. Et tu sais déjà où aller.)'],
        ] },
        { t: '(Tentation) Faire glisser tous les plateaux en métal vers lui…', do: () => ctx.usePowers(2), reply: [
          ['noa', '(Les plateaux tremblent, puis filent sur les tables et s’écrasent en tas aux pieds de Jordan. Fracas. Silence.)'],
          ['jordan', 'T’es… t’es pas normal, toi ! T’es un monstre !'],
          ['noa', '(Il a raison d’avoir peur, et c’est ça le pire. Ce n’est pas ça, être un héros.)'],
        ] },
      ] },
      ['noa', '(Il faut que ça s’arrête. Et pas comme ça.)'],
    ];
  },

  // Étape 3 — Mme Ferrand, la CPE.
  cpe: (s) => [
    [CPE, s.flags.has('bully_told') ? 'Noa ? Entre, assieds-toi. Inès m’a dit que tu voudrais peut-être me parler.' : 'Noa ? Tu as l’air préoccupé. Entre, assieds-toi.'],
    { choices: [
      { t: 'Tout raconter : le casier, la cafétéria, le surnom.', flag: 'bully_cpe_full', reply: [
        [CPE, 'Merci de me faire confiance. Ce que tu décris, ça a un nom : du harcèlement. Ce ne sont pas « des histoires d’ados ».'],
      ] },
      { t: 'Minimiser : « C’est pas grave, c’est juste Jordan. »', reply: [
        [CPE, 'Si tu es venu jusqu’ici, c’est que ça compte pour toi. Et c’est ça qui compte pour moi.'],
      ] },
    ] },
    [CPE, 'Je vais recevoir Jordan aujourd’hui. Et je vous propose une médiation demain matin, au CDI, avec moi. Tu ne seras pas seul.'],
    [CPE, 'Si ça recommence — n’importe où, même en ligne — tu reviens me voir. Il y a aussi le 3018 : gratuit, anonyme, ils sont là pour ça.'],
    ...(powersUsed(s) ? [[CPE, 'Quant à cette vidéo de plateaux qui volent… je l’ai fait retirer. Les rumeurs ne m’intéressent pas, Noa. Toi, si.']] : []),
    ['noa', '(Tu sors du bureau. C’est bizarre : rien n’est réglé, et pourtant tu respires mieux.)'],
  ],

  // Étape 4 — médiation au CDI.
  mediation: (s) => [
    [CPE, 'Jordan, Noa. Merci d’être là. Ici, chacun parle et chacun écoute. Jordan ?'],
    ['jordan', '… J’ai rien à dire.'],
    [CPE, 'Jordan.'],
    ['jordan', '… OK. Mon père bossait au port. Depuis le Nightfall, plus de boulot. À la maison, ça crie tout le temps. Et toi t’étais… là. C’était facile.'],
    ['jordan', 'C’est pas une excuse. Je sais. … Pardon, Noa.'],
    { prompt: 'Jordan attend ta réponse.', choices: [
      { t: 'Accepter ses excuses : « Merci de l’avoir dit. On repart de zéro. »', aff: 15, flag: 'jordan_ally', reply: [
        ['jordan', '… Sérieux ? OK. Merci. Et… je vais nettoyer ton casier. Promis.'],
      ] },
      { t: 'Garder tes distances : « J’entends. Mais il me faudra du temps. »', aff: 5, flag: 'jordan_distance', reply: [
        ['jordan', 'Normal. Je… je comprends.'],
        [CPE, 'C’est ton droit, Noa. Le respect, lui, n’est pas optionnel. Pour personne.'],
      ] },
      { t: 'Lui tendre la main : « Si t’as besoin de réviser, on bosse au CDI avec Inès. »', aff: 20, flag: 'jordan_ally', reply: [
        ['jordan', 'Toi, tu m’aiderais ? Après… tout ça ?'],
        ['noa', 'Je préfère un Jordan qui révise qu’un Jordan qui renverse des plateaux.'],
        ['jordan', '(il rit, pour la première fois sans méchanceté) OK. Marché conclu.'],
      ] },
    ] },
    ...(powersUsed(s) >= 2 ? [
      ['jordan', 'Et les plateaux… j’ai rien dit à personne. Mais les autres, si. Fais gaffe, Noa. Les gens parlent.'],
    ] : []),
    [CPE, 'Je vous suivrai tous les deux. Et Noa — ce que tu as fait, parler, c’est du courage. Le vrai.'],
  ],
};

// Répliques de Jordan une fois la paix faite.
export const JORDAN_TALK = [
  'J’ai révisé la physique. Delcourt m’a regardé comme si j’étais un fantôme.',
  'Mon père a retrouvé un petit boulot au port. Ça va un peu mieux à la maison.',
  'Si quelqu’un t’embête, tu me fais signe. Mais genre… pour en parler à Ferrand, hein.',
];
