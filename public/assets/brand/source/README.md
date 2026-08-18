# Brand artwork — masters

The full-resolution originals as supplied by Elbakri (2172×724 RGBA, transparent
background). Nothing in the portal loads these; they are kept so the web-sized
files one directory up can be regenerated, and so the masters are never only in
git history.

| File | Ink | Where the web-sized copy is used |
|---|---|---|
| `elbakri-logo.png` | navy `#011D5E` | the white sign-in card |
| `elbakri-logo-white.png` | white | the navy sidebar and sign-in panel |

The served copies are these files resized to 600×200 (the same 3:1 ratio) and
run through `optipng`. 600px is roughly 3× the widest place the logo is ever
drawn — 188px in the sidebar — so it stays sharp on the densest screens.

To regenerate after replacing a master:

```bash
python3 -c "
from PIL import Image
for n in ['elbakri-logo.png','elbakri-logo-white.png']:
    Image.open(f'public/assets/brand/source/{n}').convert('RGBA') \
         .resize((600,200), Image.LANCZOS) \
         .save(f'public/assets/brand/{n}','PNG',optimize=True)"
optipng -o7 public/assets/brand/elbakri-logo.png public/assets/brand/elbakri-logo-white.png
```
