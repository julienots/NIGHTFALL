// Construit les personnages réalistes et la bibliothèque d'animations
// (capture de mouvement) à partir des sources rigguées Mixamo.
// Usage : node scripts/realistic/build.mjs
// Sorties : public/assets/characters/<id>.glb + public/assets/characters/anims.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, resample, mergeDocuments, meshopt, quantize, unpartition } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { CAST, CLIPS } from '../../src/game/actors/realCast.js';

const SRC = 'assets_src/realistic';
const OUT = 'public/assets/characters';
const HF = 'https://huggingface.co/datasets/Leeoo/mixamo-rigs-clips/resolve/main';
mkdirSync(`${SRC}/char`, { recursive: true });
mkdirSync(`${SRC}/anim`, { recursive: true });
mkdirSync(OUT, { recursive: true });

async function fetchTo(url, path) {
  if (existsSync(path) && statSync(path).size > 1000) return;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  writeFileSync(path, Buffer.from(await r.arrayBuffer()));
}

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

// ---------- Personnages ----------
for (const [id, c] of Object.entries(CAST)) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(id)) continue;
  const src = `${SRC}/char/${c.src}.glb`;
  await fetchTo(`${HF}/char/${c.src}.glb`, src);
  const doc = await io.read(src);
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: c.ratio ?? 0.5, error: 0.002, lockBorder: true }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [c.tex ?? 1024, c.tex ?? 1024], quality: 82 }),
    prune(),
    dedup(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const out = `${OUT}/${id}.glb`;
  await io.write(out, doc);
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  console.log(`${id.padEnd(10)} ${c.src.padEnd(22)} ${(statSync(out).size / 1e6).toFixed(2)} Mo  ${Math.round(tris)} triangles`);
}

// ---------- Animations : un seul fichier, pistes rattachées à un squelette commun ----------
const names = [...new Set(Object.values(CLIPS))];
await Promise.all(names.map((n) => fetchTo(`${HF}/anim/${n}.glb`, `${SRC}/anim/${n}.glb`)));
let lib = null;
for (const n of names) {
  const doc = await io.read(`${SRC}/anim/${n}.glb`);
  const root = doc.getRoot();
  root.listAnimations().forEach((a, i) => a.setName(i ? `${n}_${i}` : n));
  // On ne garde que le squelette et les animations.
  for (const m of root.listMeshes()) m.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();
  for (const s of root.listSkins()) s.dispose();
  if (!lib) {
    lib = doc;
    continue;
  }
  const byName = new Map(lib.getRoot().listNodes().map((x) => [x.getName(), x]));
  const before = new Set(lib.getRoot().listAnimations());
  mergeDocuments(lib, doc);
  for (const a of lib.getRoot().listAnimations()) {
    if (before.has(a)) continue;
    for (const ch of a.listChannels()) {
      const t = ch.getTargetNode();
      const same = t && byName.get(t.getName());
      if (same) ch.setTargetNode(same);
      else ch.dispose();
    }
  }
  // Les scènes / nœuds dupliqués du document fusionné sont retirés.
  const keep = lib.getRoot().listScenes()[0];
  for (const s of lib.getRoot().listScenes()) if (s !== keep) s.dispose();
}
console.log("avant transform", lib.getRoot().listAnimations().length, lib.getRoot().listAnimations().map(a => a.listChannels().length).join(","));
await lib.transform(unpartition(), resample({ tolerance: 1e-4 }), quantize({ quantizeTexcoord: 0 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(`${OUT}/anims.glb`, lib);
console.log(`anims.glb ${lib.getRoot().listAnimations().length} animations, ${(statSync(`${OUT}/anims.glb`).size / 1e6).toFixed(2)} Mo`);
