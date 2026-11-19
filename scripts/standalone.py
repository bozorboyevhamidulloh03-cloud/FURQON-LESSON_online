#!/usr/bin/env python3
"""dist/ dan bitta faylli fur-platform.html yasaydi (internetsiz, serversiz ochiladi). Ishlatish: python3 scripts/standalone.py"""
import base64, pathlib, re
d = pathlib.Path('dist')
html = (d/'index.html').read_text(encoding='utf-8')
css = (d/'style.css').read_text(encoding='utf-8')
js = (d/'app.js').read_text(encoding='utf-8').replace('</script', '<\\/script')
pdf = (d/'vendor/pdf.min.mjs').read_text(encoding='utf-8').replace('</script', '<\\/script')
pdfw = (d/'vendor/pdf.worker.min.mjs').read_text(encoding='utf-8').replace('</script', '<\\/script')
ico = 'data:image/png;base64,' + base64.b64encode((d/'icon-96.png').read_bytes()).decode()
js = js.replace('icon-96.png', ico)
html = html.replace('<link rel="manifest" href="manifest.webmanifest">', '').replace('<link rel="apple-touch-icon" href="icon-192.png">', '')
html = html.replace('href="icon-96.png"', f'href="{ico}"')
html = html.replace('<link rel="stylesheet" href="style.css">', f'<style>{css}</style>')
html = html.replace('<script src="app.js"></script>', f'<script type="text/plain" id="v-pdf">{pdf}</script><script type="text/plain" id="v-pdfw">{pdfw}</script><script>{js}</script>')
pathlib.Path('fur-platform.html').write_text(html, encoding='utf-8')
print('fur-platform.html', round(len(html)/1e6, 2), 'MB')
