"""Découpe le logo SuperEssence (fond noir) en lettres individuelles transparentes.

Chaque lettre est exportée en PNG RGBA (couleur unie, alpha anti-aliasé) sans son
ombre portée : l'ombre est recréée à l'exécution à partir de l'alpha de la lettre,
ce qui permet de l'animer indépendamment.

Usage : python3 -I scripts/extract_logo_letters.py [source.jpg] [dossier_sortie]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "assets_src/brand/superessence_logo_source.jpg")
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "public/assets/brand")

CHARS = list("SuperEssence.")
WHITE = (255, 255, 255)
YELLOW = (255, 205, 32)
SHADOW_LEVEL = 31  # gris de l'ombre portée dans le logo source
PAD = 6

img = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float32)
lum = img.max(axis=2)

# Colonnes occupées (lettre + ombre) -> une plage par caractère.
cols = (lum > 8).any(axis=0)
runs, start = [], None
for x, on in enumerate(cols):
    if on and start is None:
        start = x
    elif not on and start is not None:
        runs.append((start, x))
        start = None
if len(runs) != len(CHARS):
    sys.exit(f"Attendu {len(CHARS)} caractères, trouvé {len(runs)}")

# Alpha de la face : 0 sur le noir/l'ombre, 1 sur la lettre pleine.
face_alpha = np.clip((lum - SHADOW_LEVEL) / (255 - SHADOW_LEVEL), 0, 1)

# Décalage de l'ombre estimé en comparant masque face et masque face+ombre.
face_mask, full_mask = lum > 128, lum > 12
best = (0.0, 0, 0)
for dx in range(0, 24):
    for dy in range(0, 24):
        shifted = np.zeros_like(face_mask)
        shifted[dy:, dx:] = face_mask[: face_mask.shape[0] - dy, : face_mask.shape[1] - dx]
        score = ((shifted | face_mask) == full_mask).mean()
        if score > best[0]:
            best = (score, dx, dy)
_, shadow_dx, shadow_dy = best

ys = np.where((lum > 128).any(axis=1))[0]
top, bottom = int(ys.min()) - PAD, int(ys.max()) + PAD + 1
logo_left = runs[0][0]
logo_right = runs[-1][1]

letters_dir = OUT / "letters"
letters_dir.mkdir(parents=True, exist_ok=True)
meta = {
    "source": SRC.name,
    "width": logo_right - logo_left + 2 * PAD,
    "height": bottom - top,
    "shadow": {"dx": shadow_dx, "dy": shadow_dy, "color": "#1f1f1f"},
    "letters": [],
}

for i, ((x0, x1), ch) in enumerate(zip(runs, CHARS)):
    x0, x1 = x0 - PAD, x1 + PAD
    a = face_alpha[top:bottom, x0:x1]
    colored = YELLOW if i >= 5 else WHITE
    rgba = np.zeros((*a.shape, 4), dtype=np.uint8)
    rgba[..., :3] = colored
    rgba[..., 3] = np.round(a * 255).astype(np.uint8)
    name = f"se_{i:02d}.png"
    Image.fromarray(rgba, "RGBA").save(letters_dir / name, optimize=True)
    meta["letters"].append({
        "char": ch,
        "file": f"letters/{name}",
        "x": x0 - logo_left + PAD,
        "y": 0,
        "w": x1 - x0,
        "h": bottom - top,
        "group": "super" if i < 5 else "essence",
    })

(OUT / "superessence_logo.json").write_text(json.dumps(meta, indent=2))

# Logo complet transparent (avec ombre), pratique pour icônes / menus.
crop = img[top:bottom + shadow_dy, logo_left - PAD:logo_right + PAD + shadow_dx]
alpha = crop.max(axis=2)
safe = np.maximum(alpha, 1)[..., None]
rgb = np.clip(crop / safe * 255, 0, 255)
full = np.dstack([rgb, alpha]).astype(np.uint8)
Image.fromarray(full, "RGBA").save(OUT / "superessence_logo.png", optimize=True)

print(f"{len(runs)} lettres exportées dans {letters_dir}, ombre dx={shadow_dx} dy={shadow_dy}")
