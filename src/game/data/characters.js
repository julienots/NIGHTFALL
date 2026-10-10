// Personnages du lycée : amis de Noa, romances possibles, scènes de dialogue.
// Une scène = liste de nœuds :
//   ['qui', 'texte']                       réplique (qui = 'noa' | id de personnage | nom libre)
//   { choices: [{ t, aff, reply, flag }] } choix du joueur (aff = variation d'affinité)
//   { do: (social) => … }                  action
// `min` : affinité requise ; `when(social)` : condition supplémentaire.
// Une scène n'est jouée qu'une fois. Une conversation « utile » par jour et par personnage.

import { JORDAN_TALK } from './bully.js';

export const CHARACTERS = {
  ines: {
    name: 'Inès', palette: 'ines', color: '#ff9cf0', romance: true,
    desc: 'Ta meilleure amie depuis le CE1. Franche, drôle, elle remarque tout — et veut devenir journaliste.',
    likes: { gift_flowers: 15, gift_choco: 10, gift_comic: 6, gift_starmap: 5, gift_game: 4 },
  },
  camille: {
    name: 'Camille', palette: 'camille', color: '#b9a8ff', romance: true,
    desc: 'Nouvelle au lycée depuis la rentrée. Passionnée d’astronomie, un peu solitaire. Elle parle peu de sa famille.',
    likes: { gift_starmap: 20, gift_flowers: 8, gift_comic: 8, gift_choco: 5, gift_game: 3 },
  },
  malik: {
    name: 'Malik', palette: 'malik', color: '#ff8a5d', romance: false,
    desc: 'Ton pote de toujours. Blagueur, champion de « Neon Racers », toujours affamé. Il a une petite sœur, Yasmine.',
    likes: { gift_game: 20, gift_choco: 12, gift_comic: 10, gift_flowers: 2, gift_starmap: 3 },
  },
  theo: {
    name: 'Théo', palette: 'theo', color: '#9fd8ff', romance: false,
    desc: 'Capitaine de l’équipe de foot. Arrogant au premier abord. Son grand frère a disparu la nuit du Nightfall.',
    likes: { gift_choco: 8, gift_game: 10, gift_comic: 6, gift_flowers: 3, gift_starmap: 4 },
  },
  jordan: {
    name: 'Jordan', palette: 'jordan', color: '#ff7a45', romance: false, hiddenUntil: 'met_jordan',
    desc: 'Terminale, blouson rouge, toujours entouré de sa bande. Il a fait de Noa sa cible… Mais qu’est-ce qui se passe chez lui ?',
    likes: { gift_game: 12, gift_choco: 8, gift_comic: 6, gift_flowers: 2, gift_starmap: 3 },
  },
};

// Niveaux de relation selon l'affinité (0–100).
export const LEVELS = [
  [0, 'Connaissance'], [20, 'Camarade'], [40, 'Ami(e)'], [60, 'Proche'], [80, 'Meilleur(e) ami(e)'],
];

export function levelName(aff, status) {
  if (status === 'couple') return 'En couple ❤';
  let n = LEVELS[0][1];
  for (const [min, name] of LEVELS) if (aff >= min) n = name;
  return n;
}

// Cadeaux (achetables à la boutique, section « Cadeaux »).
export const GIFTS = ['gift_flowers', 'gift_choco', 'gift_comic', 'gift_starmap', 'gift_game'];

export const SCENES = [
  // ================= PROLOGUE (jour 1) =================
  {
    id: 'camille_lab', char: 'camille', min: 0, prologue: true,
    lines: [
      ['camille', 'Psst. Tu crois vraiment que c’est une météorite, le caillou de Delcourt ?'],
      { choices: [
        { t: 'Une météorite ? On dirait plutôt un bout de néon cassé.', aff: 4, reply: [['camille', '(rire étouffé) Un néon qui brille tout seul. Classique.']] },
        { t: 'Ça vient d’Aegis. Mon père bossait là-bas.', aff: 6, flag: 'camille_aegis', reply: [['camille', '… Aegis ? Le monde est petit.'], ['noa', 'Pourquoi tu dis ça ?'], ['camille', 'Pour rien. Écoute, il te regarde.']] },
        { t: 'Chut, je veux écouter.', aff: 1, reply: [['camille', 'D’accord, monsieur le premier de la classe.']] },
      ] },
    ],
  },
  {
    id: 'malik_corridor', char: 'malik', min: 0, prologue: true,
    lines: [
      ['malik', 'NOA ! Mon frère. T’as survécu à Delcourt ? Il paraît que le caillou t’a électrocuté ?'],
      { choices: [
        { t: 'Il m’a juste piqué. Comme une décharge de pull en laine.', aff: 3, reply: [['malik', 'Une décharge de pull. Respect. Je mettrai ça dans ta biographie.']] },
        { t: 'Tous les aimants du labo m’ont sauté dessus, mec.', aff: 5, flag: 'malik_magnets', reply: [['malik', 'Attends… t’es devenu un FRIGO ?! Je savais que t’avais un truc.']] },
        { t: 'Laisse tomber, c’était rien.', aff: 1, reply: [['malik', 'Rien du tout. Comme mes notes en physique.']] },
      ] },
      ['malik', 'Bon, ce soir : tournoi de Neon Racers en ligne. Tu viens ou tu me lâches encore ?'],
      { choices: [
        { t: 'Je serai là. Prépare-toi à perdre.', aff: 4, reply: [['malik', 'Ha ! On en reparle à 21 h.']] },
        { t: 'Je sais pas, ma mère est de garde, je dois rentrer.', aff: 2, reply: [['malik', 'Ok, ok. Envoie un message si tu changes d’avis.']] },
      ] },
      ['malik', 'Inès t’attend devant l’entrée, au fait. Elle a dit « dis-lui de se bouger ».'],
    ],
  },
  {
    id: 'ines_gate', char: 'ines', min: 0, prologue: true,
    lines: [
      ['ines', 'Noa ! T’as encore fini en retenue avec Delcourt ?'],
      { choices: [
        { t: 'Il m’a gardé pour ranger le labo. Vingt minutes.', aff: 3, reply: [['ines', 'Vingt minutes ! Il t’aime bien, en fait. C’est flippant.']] },
        { t: 'Delcourt m’adore, c’est mon fan numéro un.', aff: 5, reply: [['ines', '(elle rit) Ton fan numéro un, c’est moi. Il est numéro deux.']] },
        { t: 'J’ai pas trop envie d’en parler.', aff: 1, reply: [['ines', 'D’accord. Je te connais, tu me raconteras plus tard.']] },
      ] },
      ['ines', 'Mon bus passe dans cinq minutes. Tu rentres à pied ? T’as vu les infos ? Encore des coupures vers Halden.'],
      ['noa', 'C’est les vieux transfos d’Aegis. Mon père disait que tout le quartier tenait avec du scotch.'],
      ['ines', '… Désolée. Je pensais pas à ton père.'],
      { choices: [
        { t: 'T’inquiète, ça va. Vraiment.', aff: 3, reply: [['ines', 'Menteur. Mais d’accord.']] },
        { t: 'Ça va mieux quand t’es là, en fait.', aff: 7, flag: 'ines_spark', reply: [['ines', '… (elle rougit) Arrête, tu vas me faire rater le bus.']] },
        { t: 'File, tu vas le rater.', aff: 2, reply: [['ines', 'Oui chef.']] },
      ] },
      ['ines', 'Envoie-moi un message quand t’es rentré. Je rigole pas.'],
    ],
  },

  // ================= JOURS SUIVANTS =================
  // ----- Inès -----
  {
    id: 'ines_1', char: 'ines', min: 0,
    lines: [
      ['ines', 'Tu m’as pas envoyé de message hier soir. J’ai cru que… avec tout ce qui s’est passé…'],
      { choices: [
        { t: 'J’étais chez moi, je dormais. Désolé.', aff: 1, reply: [['ines', 'Avec les sirènes toute la nuit ? Tu dors comme un ours alors.']] },
        { t: 'C’est compliqué. Je te raconterai, promis.', aff: 5, flag: 'ines_promise', reply: [['ines', 'Je note. Et je n’oublie jamais une promesse, Noa Vant.']] },
        { t: 'Tu t’inquiétais pour moi ?', aff: 6, reply: [['ines', 'Évidemment, idiot. Qui d’autre m’aiderait à survivre aux maths ?']] },
      ] },
    ],
  },
  {
    id: 'ines_2', char: 'ines', min: 18,
    lines: [
      ['ines', 'J’ai postulé pour le journal du lycée. Je veux enquêter sur les failles. Personne ne dit la vérité sur Aegis.'],
      { choices: [
        { t: 'Tu vas être géniale. Tu poses toujours les bonnes questions.', aff: 7, reply: [['ines', 'C’est le truc le plus gentil qu’on m’ait dit cette semaine.']] },
        { t: 'C’est dangereux, Inès. Fais attention.', aff: 4, reply: [['ines', 'Tu parles comme ma mère. … Mais merci.']] },
        { t: 'Le journal du lycée ? Personne le lit.', aff: -3, reply: [['ines', 'Super. Merci pour ton soutien, vraiment.']] },
      ] },
    ],
  },
  {
    id: 'ines_3', char: 'ines', min: 34,
    lines: [
      ['ines', 'Regarde cette photo. Le « garçon volant » d’Halden. Il a le même sweat que toi. Le MÊME.'],
      { choices: [
        { t: '(Lui dire la vérité) … C’est moi, Inès.', aff: 10, flag: 'ines_knows', reply: [['ines', '…'], ['ines', 'Je le savais. Je le SAVAIS. Tu te rends compte de ce que ça veut dire ?'], ['ines', 'Je garde ton secret. Mais à partir de maintenant, tu ne me mens plus.']] },
        { t: 'Il est beau gosse, non ? Normal qu’il s’habille comme moi.', aff: 5, reply: [['ines', '(elle lève les yeux au ciel) Ton ego mériterait sa propre faille.']] },
        { t: 'Des sweats comme ça, y en a partout.', aff: 0, reply: [['ines', 'Mmh. Si tu le dis.']] },
      ] },
    ],
  },
  {
    id: 'ines_4', char: 'ines', min: 48,
    lines: [
      ['ines', 'Tu sais ce qui me manque ? Quand on allait au café du parc après les cours, juste nous deux.'],
      ['ines', 'On devrait y retourner. Enfin… si tu veux.'],
      { choices: [
        { t: 'J’adorerais. Vraiment.', aff: 6, reply: [['ines', 'Alors c’est noté. Propose-moi un jour, je dirai oui.']] },
        { t: 'Avec Malik aussi ? Ce serait cool.', aff: 1, reply: [['ines', 'Ah. Oui. Avec Malik. Bien sûr.']] },
      ] },
    ],
  },

  // ----- Camille -----
  {
    id: 'camille_1', char: 'camille', min: 0,
    lines: [
      ['camille', 'Tu as vu le ciel, l’autre nuit ? La déchirure. Elle était alignée pile sur l’étoile Polaire.'],
      { choices: [
        { t: 'Tu as remarqué ça ? C’est super précis.', aff: 6, reply: [['camille', 'J’ai un télescope. Et pas beaucoup d’amis. Ça laisse du temps.']] },
        { t: 'J’étais un peu occupé à courir, honnêtement.', aff: 3, reply: [['camille', 'Comme tout le monde. Moi, je regardais en haut.']] },
        { t: 'L’astronomie, c’est pas un peu ennuyeux ?', aff: -3, reply: [['camille', 'Ennuyeux. D’accord. Bonne journée, Noa.']] },
      ] },
      ['camille', 'Le club d’astronomie se réunit le jeudi. On est deux. Trois, si tu viens.'],
    ],
  },
  {
    id: 'camille_2', char: 'camille', min: 18,
    lines: [
      ['camille', 'Mon père travaille dans la recherche. Il rentre tard, il ne dit jamais sur quoi.'],
      ['camille', 'Depuis le Nightfall, il ne rentre plus du tout. Il appelle juste pour dire « reste à l’intérieur ».'],
      { choices: [
        { t: 'Ça doit être dur. Si tu veux parler, je suis là.', aff: 8, reply: [['camille', '… Merci. Personne ne me dit ça, d’habitude.']] },
        { t: 'Mon père aussi faisait de la recherche. Il est mort.', aff: 5, reply: [['camille', 'Je suis désolée. Je ne savais pas.'], ['camille', 'On est un peu pareils, alors.']] },
        { t: 'Il doit avoir ses raisons.', aff: 1, reply: [['camille', 'Peut-être. C’est ce que je me répète.']] },
      ] },
    ],
  },
  {
    id: 'camille_3', char: 'camille', min: 34,
    lines: [
      ['camille', 'Il faut que je te dise un truc. Mon nom complet, c’est Camille Hollis.'],
      ['noa', '(Hollis… le nom dans l’enregistrement de papa.)'],
      ['camille', 'Mon père dirige la recherche d’Aegis. Les gens me regardent bizarrement quand ils l’apprennent.'],
      { choices: [
        { t: 'Tu n’es pas ton père. Ça ne change rien pour moi.', aff: 10, flag: 'camille_trust', reply: [['camille', '(elle sourit, vraiment) Tu es le premier à dire ça.']] },
        { t: 'Hollis ? … Tu sais ce qu’il fait, là-bas ?', aff: 3, flag: 'camille_hollis_asked', reply: [['camille', 'Non. Et j’ai peur de le découvrir.']] },
        { t: '(Rester silencieux)', aff: -2, reply: [['camille', 'Je vois. Laisse tomber.']] },
      ] },
    ],
  },
  {
    id: 'camille_4', char: 'camille', min: 48,
    lines: [
      ['camille', 'Au bord de l’étang du parc, le soir, on voit Vénus se lever. C’est mon endroit préféré.'],
      { choices: [
        { t: 'Tu me le montreras ?', aff: 6, reply: [['camille', 'Si tu me le demandes gentiment. Propose-moi un soir.']] },
        { t: 'Je préfère les néons de la ville.', aff: 0, reply: [['camille', 'Chacun ses étoiles.']] },
      ] },
    ],
  },

  // ----- Malik -----
  {
    id: 'malik_1', char: 'malik', min: 0,
    lines: [
      ['malik', 'Mec. Ma sœur Yasmine a fait des cauchemars toute la nuit. Elle dit que des « hommes-araignées » marchaient sur notre toit.'],
      { choices: [
        { t: 'Dis-lui que plus rien ne grimpera sur votre toit. Promis.', aff: 7, flag: 'malik_promise', reply: [['malik', 'T’es bizarre depuis deux jours, toi. Mais… merci. Ça lui fera plaisir.']] },
        { t: 'C’était sûrement le vent.', aff: 2, reply: [['malik', 'Le vent avec huit pattes. Ouais.']] },
      ] },
    ],
  },
  {
    id: 'malik_2', char: 'malik', min: 20,
    lines: [
      ['malik', 'Tournoi de Neon Racers samedi. J’ai besoin d’un co-pilote. Le dernier m’a trahi pour une pizza.'],
      { choices: [
        { t: 'Je suis ton homme. Personne ne trahit pour une pizza.', aff: 6, reply: [['malik', 'Sauf si c’est une quatre fromages. Mais je te fais confiance.']] },
        { t: 'Je peux pas, j’ai… des trucs le soir.', aff: 1, reply: [['malik', 'Des « trucs ». T’as une copine secrète ou quoi ?']] },
      ] },
    ],
  },
  {
    id: 'malik_3', char: 'malik', min: 40,
    lines: [
      ['malik', 'Yasmine a dessiné un truc pour toi. C’est… un mec qui vole avec des anneaux. Elle dit que c’est toi.'],
      ['malik', 'Je lui ai dit que t’avais même pas le permis scooter. Mais elle insiste.'],
      { choices: [
        { t: 'Dis-lui qu’elle a très bon goût.', aff: 6, reply: [['malik', '(il te fixe longtemps) … Ok. On en reparlera un jour, toi et moi.']] },
        { t: 'Moi, voler ? Elle regarde trop de dessins animés.', aff: 2, reply: [['malik', 'C’est ce que j’ai dit. Mot pour mot.']] },
      ] },
      { do: (s) => s.reward('malik_drawing') },
    ],
  },

  // ----- Théo -----
  {
    id: 'theo_1', char: 'theo', min: 0,
    lines: [
      ['theo', 'Hé, regarde où tu marches, Vant. … Attends. T’as l’air crevé.'],
      { choices: [
        { t: 'Toi aussi, t’as une sale tête.', aff: 2, reply: [['theo', 'Ouais. Mauvaise nuit.']] },
        { t: 'Ça va, Théo ? Sérieusement.', aff: 6, reply: [['theo', '… Mon frère Lucas est pas rentré depuis le Nightfall. Personne sait où il est.']] },
        { t: 'Pousse-toi.', aff: -3, reply: [['theo', 'Charmant.']] },
      ] },
    ],
  },
  {
    id: 'theo_2', char: 'theo', min: 18,
    lines: [
      ['theo', 'Lucas bossait comme vigile chez Aegis. Dans la forêt de Blackwood. Les flics disent qu’il a « fugué ».'],
      { choices: [
        { t: 'Je vais t’aider à le retrouver. Je te le promets.', aff: 10, flag: 'theo_promise', reply: [['theo', 'Toi ? … Pourquoi pas. T’es le seul à pas me prendre pour un fou.']] },
        { t: 'Blackwood ? C’est là que sont les labos d’Aegis…', aff: 5, reply: [['theo', 'Exactement. Et personne veut y mettre les pieds.']] },
      ] },
    ],
  },
  {
    id: 'theo_3', char: 'theo', min: 38,
    lines: [
      ['theo', 'Tu veux rejoindre l’équipe ? T’as pris des muscles, on dirait. Et tu cours vite. Trop vite, même.'],
      { choices: [
        { t: 'Pourquoi pas ! J’ai besoin de me défouler.', aff: 6, reply: [['theo', 'Entraînement mardi. Sois pas en retard, capitaine Vant.']] },
        { t: 'Le foot, c’est pas mon truc. Mais je viendrai t’encourager.', aff: 4, reply: [['theo', 'Ça marche. Ramène Malik, il crie fort.']] },
      ] },
    ],
  },
];

// Petites phrases quand il n'y a plus de scène à jouer aujourd'hui.
export const SMALL_TALK = {
  ines: ['Tu as fini l’exposé d’histoire ? Moi non plus.', 'Il paraît que la cafète sert des frites vendredi. ENFIN.', 'Tu as une tête de quelqu’un qui a mal dormi. Encore.'],
  camille: ['Ce soir, ciel dégagé. Enfin, si la faille nous laisse tranquilles.', 'J’ai relu mes notes sur Orion. C’est mieux que les infos.', 'Tu sens ça ? L’air est électrique. Comme avant un orage.'],
  malik: ['J’ai faim. C’est tout. C’est mon message.', 'Si tu vois Delcourt, dis-lui que mon devoir est « en chemin ».', 'Neon Racers 3 sort bientôt. Je vais pleurer.'],
  jordan: JORDAN_TALK,
  theo: ['Entraînement annulé. Encore une faille sur le terrain.', 'Si t’entends parler de Lucas… tu me dis.', 'Pas mal ton sprint dans le couloir, ce matin.'],
};

// Rendez-vous : lieu, ambiance, questions. Score ≥ 2 → moment de vérité.
export const DATES = {
  ines: {
    place: 'park_cafe', placeLabel: 'Café du parc',
    lines: [
      ['ines', 'Deux chocolats chauds, comme en cinquième. Tu te souviens ? Tu avais renversé le tien sur mon cahier.'],
      { choices: [
        { t: 'Et tu m’as fait la tête une semaine.', good: true, reply: [['ines', 'Trois jours ! … Bon, quatre.']] },
        { t: 'Non, pas vraiment.', good: false, reply: [['ines', 'Super. Moi je me souviens de tout, apparemment.']] },
      ] },
      ['ines', 'Tu as changé, Noa. Depuis le Nightfall. Tu es plus… sûr de toi. Et plus loin, aussi.'],
      { choices: [
        { t: 'Je suis là. Pour toi, je serai toujours là.', good: true, reply: [['ines', '(elle sourit et baisse les yeux)']] },
        { t: 'J’ai beaucoup de choses en tête.', good: false, reply: [['ines', 'Je vois ça.']] },
        { t: 'Plus sûr de moi ? Merci, je fais du sport.', good: true, reply: [['ines', '(elle éclate de rire) T’es bête.']] },
      ] },
    ],
    confess: [
      ['ines', 'Noa… Je peux te dire un truc sans que tu fasses une tête bizarre ?'],
      { choices: [
        { t: '(Lui prendre la main) Moi d’abord. Je t’aime bien. Plus que bien.', couple: true, reply: [['ines', '… Idiot. Ça fait des années que j’attends que tu le dises.']] },
        { t: 'Tu es ma meilleure amie. Je veux pas perdre ça.', couple: false, reply: [['ines', '… Oui. Bien sûr. Ta meilleure amie.']] },
      ] },
    ],
  },
  camille: {
    place: 'park_pond', placeLabel: 'Étang du parc',
    lines: [
      ['camille', 'Là. Juste au-dessus des arbres. Le point qui ne scintille pas, c’est Vénus.'],
      { choices: [
        { t: 'C’est magnifique. Comme quelqu’un que je connais.', good: true, reply: [['camille', 'Wow. Elle était préparée, celle-là. … Elle marche quand même.']] },
        { t: 'On dirait un lampadaire.', good: false, reply: [['camille', 'Un lampadaire à quarante millions de kilomètres. D’accord.']] },
      ] },
      ['camille', 'Parfois je me dis que la faille, c’est une porte. Et que mon père sait ce qu’il y a derrière.'],
      { choices: [
        { t: 'Quoi qu’il y ait derrière, tu ne seras pas seule.', good: true, reply: [['camille', '(elle se rapproche un peu)']] },
        { t: 'Il faut qu’on le fasse parler.', good: false, reply: [['camille', 'Tu ne connais pas mon père.']] },
        { t: 'Alors on la refermera. Ensemble.', good: true, reply: [['camille', 'Ensemble. J’aime bien ce mot.']] },
      ] },
    ],
    confess: [
      ['camille', 'Noa… Je crois que je suis en train de tomber amoureuse. Et ça me fait peur.'],
      { choices: [
        { t: 'Moi aussi. On aura peur à deux.', couple: true, reply: [['camille', '(elle pose sa tête sur ton épaule) À deux, alors.']] },
        { t: 'Je tiens à toi… mais comme une amie.', couple: false, reply: [['camille', 'D’accord. Merci d’être honnête.']] },
      ] },
    ],
  },
};

// Cours : trois questions par séance (bonne réponse = XP).
export const LESSONS = [
  {
    subject: 'Physique — M. Delcourt', room: 'labo', teacher: 'M. Delcourt',
    intro: 'Aujourd’hui : le magnétisme. Oui, Vant, regardez-moi au lieu de regarder la fenêtre.',
    qs: [
      { q: 'Deux pôles nord d’aimants qu’on approche…', a: ['s’attirent', 'se repoussent', 'ne font rien'], ok: 1 },
      { q: 'Un courant électrique dans un fil crée…', a: ['un champ magnétique', 'de la lumière noire', 'du froid'], ok: 0 },
      { q: 'L’unité du champ magnétique est…', a: ['le volt', 'le tesla', 'le watt'], ok: 1 },
    ],
  },
  {
    subject: 'Histoire — Mme Rocher', room: 'salle12', teacher: 'Mme Rocher',
    intro: 'Vesper a été fondée en 1891 autour des forges de la vallée. Prenez des notes.',
    qs: [
      { q: 'Autour de quoi Vesper s’est-elle développée ?', a: ['un port de pêche', 'des forges', 'une université'], ok: 1 },
      { q: 'La révolution industrielle commence au…', a: ['XVIIIe siècle', 'XIIe siècle', 'XXIe siècle'], ok: 0 },
      { q: 'Une source historique « primaire », c’est…', a: ['un manuel scolaire', 'un document de l’époque', 'un film récent'], ok: 1 },
    ],
  },
  {
    subject: 'Français — M. Benali', room: 'salle14', teacher: 'M. Benali',
    intro: 'Le héros tragique. Qui peut me dire ce qui le distingue ?',
    qs: [
      { q: 'Un héros tragique est souvent…', a: ['sans défaut', 'condamné par son destin', 'un animal'], ok: 1 },
      { q: 'Une « métaphore », c’est…', a: ['une comparaison sans outil', 'une rime', 'un dialogue'], ok: 0 },
      { q: 'Qui a écrit « Les Misérables » ?', a: ['Molière', 'Victor Hugo', 'Zola'], ok: 1 },
    ],
  },
];
