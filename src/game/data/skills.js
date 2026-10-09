// Arbre de compétences : 5 branches, 3 niveaux chacune. Chaque compétence
// modifie réellement le jeu (voir SkillTree.mods() et leur lecture dans hero.js).
export const BRANCHES = {
  force: { label: 'FORCE', color: '#ff5d5d', desc: 'Dégâts, fouet et coups d’anneaux.' },
  mobility: { label: 'MOBILITÉ', color: '#6fcf97', desc: 'Sprint, roulade et vol.' },
  energy: { label: 'ÉNERGIE', color: '#a56bff', desc: 'Régénération et rafale d’anneaux.' },
  survival: { label: 'SURVIE', color: '#4fc3f7', desc: 'Santé, garde et seconde chance.' },
  mastery: { label: 'MAÎTRISE', color: '#ffcd20', desc: 'Parade, riposte et enchaînements.' },
};

// tier : 1..3 (il faut au moins 1 point dans le niveau précédent de la branche).
export const SKILLS = {
  f1: { branch: 'force', tier: 1, max: 3, cost: 1, name: 'Poings lourds', desc: '+10 % de dégâts par rang.' },
  f2: { branch: 'force', tier: 2, max: 2, cost: 1, name: 'Fouet élargi', desc: 'Portée du fouet +1 m et angle plus large par rang.' },
  f3: { branch: 'force', tier: 3, max: 1, cost: 2, name: 'Anneau perforant', desc: 'Le 3e coup du combo traverse toute une ligne d’ennemis (+1,5 m).' },
  m1: { branch: 'mobility', tier: 1, max: 3, cost: 1, name: 'Foulée', desc: 'Vitesse de sprint +8 % par rang.' },
  m2: { branch: 'mobility', tier: 2, max: 2, cost: 1, name: 'Roulade fantôme', desc: 'Invulnérabilité de la roulade +0,08 s et recharge plus courte par rang.' },
  m3: { branch: 'mobility', tier: 3, max: 1, cost: 2, name: 'Réacteurs magnétiques', desc: 'Vol et boost +25 %, montée plus rapide.' },
  e1: { branch: 'energy', tier: 1, max: 3, cost: 1, name: 'Induction', desc: 'Régénération d’énergie +1,5/s par rang.' },
  e2: { branch: 'energy', tier: 2, max: 2, cost: 1, name: 'Rafale étendue', desc: '+1 cible et −4 d’énergie par rang pour la rafale.' },
  e3: { branch: 'energy', tier: 3, max: 1, cost: 2, name: 'Surcharge', desc: 'Dégâts de la rafale +35 %.' },
  s1: { branch: 'survival', tier: 1, max: 3, cost: 1, name: 'Endurance', desc: '+20 santé max par rang.' },
  s2: { branch: 'survival', tier: 2, max: 2, cost: 1, name: 'Garde de fer', desc: 'Le bouclier encaisse mieux et coûte moins d’énergie.' },
  s3: { branch: 'survival', tier: 3, max: 1, cost: 2, name: 'Second souffle', desc: 'Un coup mortel laisse 1 PV (une fois toutes les 90 s).' },
  x1: { branch: 'mastery', tier: 1, max: 2, cost: 1, name: 'Parade parfaite', desc: 'Fenêtre de parade +0,08 s par rang.' },
  x2: { branch: 'mastery', tier: 2, max: 1, cost: 1, name: 'Riposte', desc: 'Après une parade, le coup suivant inflige double dégâts.' },
  x3: { branch: 'mastery', tier: 3, max: 1, cost: 2, name: 'Enchaînement', desc: '+5 % de dégâts par coup consécutif (jusqu’à +40 %).' },
};

export const RESPEC_COST = 100; // Credits, au terminal du refuge
