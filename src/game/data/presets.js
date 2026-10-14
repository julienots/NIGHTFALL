// Points de départ de la sélection de chapitre (écran titre). Chaque preset
// est une sauvegarde complète : missions précédentes terminées, niveau et
// équipement cohérents avec l'avancée.
import { MISSIONS } from './missions.js';

const ORDER = ['p01_after_school', 'p02_nightfall', 'p03_rings', 'm01_first_contact', 'm02_aegis_echo', 'm03_colossus', 'm04_umbra', 'd01_double_life'];

function missionsUntil(last) {
  const state = {};
  for (const id of ORDER) {
    state[id] = { status: 'done', step: MISSIONS[id].steps.length, progress: 0 };
    if (id === last) break;
  }
  return { state, tracked: null };
}

const item = (id, uid) => ({ uid, id, level: 0, fav: false });

export function chapterPreset(ch) {
  if (ch === 'prologue') return null; // nouvelle partie classique
  const base = {
    seed: Math.floor(Math.random() * 1e9),
    playTime: 0,
    opened: [],
    pendingLoot: {},
    kills: 0,
    saidOnce: [],
    skills: null,
  };
  if (ch === 'ch1') {
    return {
      ...base,
      hero: { x: 51.5, y: 26, z: 45.5, yaw: Math.PI, hp: 999, energy: 100, abyss: 0 },
      inventory: { credits: 80, shards: 0, items: [item('patrol_gloves', 1)], stacks: { medkit: 2 }, equipped: { weapon: 1, armor: null, skin: null }, nextUid: 2 },
      progression: { level: 2, xp: 0, skillPoints: 1 },
      missions: missionsUntil('p03_rings'),
      clock: { day: 1, phase: 'night' },
      storyFlags: ['skipIntro'],
    };
  }
  // Mode libre : tous les pouvoirs, la ville en plein jour, horloge qui tourne ;
  // l'histoire principale est passée, les missions secondaires restent ouvertes.
  if (ch === 'free') {
    return {
      ...base,
      hero: { x: 0, y: 0.15, z: 24, yaw: Math.PI, hp: 999, energy: 100, abyss: 100 },
      inventory: {
        credits: 1500, shards: 30,
        items: [item('amber_knuckles', 1), item('street_jacket', 2), item('eclipse_gauntlets', 3), item('hoodie_midnight', 4)],
        stacks: { medkit: 5, gift_flowers: 2, gift_choco: 2, gift_starmap: 1, gift_game: 1 },
        equipped: { weapon: 3, armor: 2, skin: null },
        nextUid: 5,
      },
      progression: { level: 10, xp: 0, skillPoints: 6 },
      missions: missionsUntil('d01_double_life'),
      opened: ['crate_tactical_1', 'boss_cache'],
      clock: { day: 1, phase: 'morning', hour: 9 },
      storyFlags: ['freeRoam'],
    };
  }
  // Mode Créatif : comme le mode libre, avec tous les pouvoirs au maximum, des
  // crédits illimités et le menu de création (B).
  if (ch === 'crea') {
    const free = chapterPreset('free');
    return {
      ...free,
      inventory: {
        ...free.inventory,
        credits: 99999, shards: 999,
        items: [...free.inventory.items, item('void_phalanx', 5), item('nightfall_shell', 6), item('hoodie_abyss', 7)],
        equipped: { weapon: 5, armor: 6, skin: null },
        nextUid: 8,
      },
      progression: { level: 20, xp: 0, skillPoints: 20 },
      storyFlags: ['freeRoam', 'creative'],
    };
  }
  // Chapitre 2 : le lendemain matin, dans la chambre de Noa.
  return {
    ...base,
    hero: { zone: 'home', hp: 999, energy: 100, abyss: 40 },
    inventory: {
      credits: 600, shards: 12,
      items: [item('amber_knuckles', 1), item('street_jacket', 2)],
      stacks: { medkit: 3, gift_flowers: 1, gift_starmap: 1 },
      equipped: { weapon: 1, armor: 2, skin: null },
      nextUid: 3,
    },
    progression: { level: 7, xp: 0, skillPoints: 4 },
    missions: missionsUntil('m04_umbra'),
    opened: ['crate_tactical_1', 'boss_cache'],
    clock: { day: 2, phase: 'morning' },
    storyFlags: ['skipIntro'],
  };
}
