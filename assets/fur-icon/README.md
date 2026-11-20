# FUR fayl ikonkasi

| Fayl | Tavsif |
|---|---|
| `fur-icon.svg` | Master (512×512), shriftsiz — harflar chiziq yo'llari |
| `fur-icon-small.svg` | 16–48 px uchun soddalashtirilgan variant (matnsiz) |
| `fur-icon-{16…1024}.png` | PNG variantlar (shaffof fon) |
| `fur.ico` | Windows ICO: 16, 24, 32, 48, 64, 128, 256 px |
| `render.cjs` | SVG → PNG (Playwright), keyin ICO PIL bilan yig'iladi |

## Windows'da `.fur` ni ikonkaga bog'lash
Loyihada Windows o'rnatuvchisi yo'q, shuning uchun avtomatik bog'lanmagan. O'rnatuvchi qo'shilganda
`fur.ico` ni ilova yoniga qo'ying va (foydalanuvchi darajasida) shu kalitlarni yozing:

```
HKCU\Software\Classes\.fur                      (Default) = FURQON.Document
HKCU\Software\Classes\FURQON.Document\DefaultIcon (Default) = "C:\...\fur.ico,0"
```
Fayl formati (`packages/fur-format`) o'zgartirilmagan.
