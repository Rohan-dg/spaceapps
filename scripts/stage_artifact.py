"""Stage dist/ for publishing as a claude.ai Artifact.

The artifact host wraps the page in its own <html>/<head>/<body>, so page.html keeps only the head tags and the
app root. Prints two JSON file lists (each under the 64 MB per-publish limit): the app and small data first, then
the large Moon textures and DEM. Usage: npm run build && python3 scripts/stage_artifact.py <out_dir>
"""
import json, os, re, shutil, sys

out = sys.argv[1] if len(sys.argv) > 1 else 'artifact'
shutil.rmtree(out, ignore_errors=True)
shutil.copytree('dist', out)
s = open(os.path.join(out, 'index.html')).read()
head = re.search(r'<head>(.*)</head>', s, re.S).group(1)
body = re.search(r'<body>(.*)</body>', s, re.S).group(1)
head = re.sub(r'\s*<meta charset[^>]*>|\s*<meta name="viewport"[^>]*>', '', head)
title = re.search(r'\s*<title>.*?</title>', head).group(0)
head = head.replace(title, '')
open(os.path.join(out, 'page.html'), 'w').write(title.strip() + '\n' + head.strip() + '\n' + body.strip() + '\n')
os.remove(os.path.join(out, 'index.html'))
skip = {'page.html', '_headers'}
small, large = [], []
for root, _, files in os.walk(out):
    for f in files:
        p = os.path.relpath(os.path.join(root, f), out)
        if p in skip: continue
        (large if os.path.getsize(os.path.join(root, f)) > 4_000_000 else small).append({'path': p})
print(json.dumps({'small': sorted(small, key=lambda x: x['path']), 'large': sorted(large, key=lambda x: x['path'])}))

# SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
