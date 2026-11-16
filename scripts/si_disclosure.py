"""Append (or refresh) an SI disclosure comment at the end of every source file, per the NASA Space Apps project
submission guide: code made with SI tools must say so in its text. Who wrote each file comes from the commit history:
the "Co-Authored-By: Claude ..." trailers, the commits made by OpenAI Codex (listed below, from its session logs), and
the commits made since the history rewrite of 2026-11-15, which no longer carry trailers.

Usage: python3 scripts/si_disclosure.py <repo with the pre-rewrite history at refs/old/main> [--dry]
Running it again replaces the existing disclosure line instead of adding another.
"""
import collections, os, re, subprocess, sys

OLD = sys.argv[1]
DRY = '--dry' in sys.argv
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REWRITE_TIP = 'fe23280'  # first commit of the rewritten history; newer commits are read from this checkout

# commits OpenAI Codex made (from its local session log); merges are ignored anyway
CODEX = {'5b5f04a', '7c2c835', 'cde9f5f', '13f9aef', '43250e5', '0cfe1e2'}
# Codex committed this one, but its files (the first rover game engine, terrain, worker, rules and model script) had been
# written, uncommitted, by a Claude Code session on Claude Fable 5.2 in the same folder
FABLE = {'d655e68'}
# commits made after the rewrite without a trailer, by Claude Code sessions on Claude Opus 5.5
OPUS_NO_TRAILER = {'2411365', '9699aa5', 'b7a403a', '24224e4', '58b1f4c'}
HUMANS = {'Rohan-dg', 'Saravanan Kabilan', 'SaravanaDebug'}

def git(repo, *a):
    return subprocess.run(['git', '-C', repo, *a], capture_output=True, text=True, check=True).stdout

def agent(h, author, trailer):
    if h[:7] in FABLE: return 'Claude Fable 5.2'
    if h[:7] in CODEX: return 'OpenAI Codex'
    m = re.search(r'Claude ([\w. ]+?)\s*<', trailer or '')
    if m: return f'Claude {m.group(1)}'
    if h[:7] in OPUS_NO_TRAILER: return 'Claude Opus 5.5'
    if author == 'Claude': return 'Claude'
    return None  # a person, with no SI tool recorded

def walk(repo, rng):
    """(commit, author, trailer, [(status, old, new)]) oldest first, merges skipped, renames detected"""
    out = git(repo, 'log', '--reverse', '--no-merges', '-M', '--name-status', '--format=@@%H|%an|%(trailers:key=Co-Authored-By,valueonly,separator=;)', rng)
    commits = []
    for block in out.split('@@')[1:]:
        lines = block.strip('\n').split('\n')
        h, author, trailer = (lines[0].split('|') + ['', ''])[:3]
        changes = []
        for ln in lines[1:]:
            if not ln.strip(): continue
            p = ln.split('\t')
            changes.append((p[0], p[1], p[2] if len(p) > 2 else p[1]))
        commits.append((h, author, trailer, changes))
    return commits

tally = collections.defaultdict(collections.Counter)
people = collections.defaultdict(set)
for repo, rng in ((OLD, 'refs/old/main'), (ROOT, f'{REWRITE_TIP}..HEAD')):
    for h, author, trailer, changes in walk(repo, rng):
        a = agent(h, author, trailer)
        for st, old, new in changes:
            if st.startswith('R'):
                tally[new] += tally.pop(old, collections.Counter()); people[new] |= people.pop(old, set())
            if st.startswith('D'): continue
            if a: tally[new][a] += 1
            elif author in HUMANS: people[new].add(author)

STYLE = {  # extension -> (open, close)
    '.ts': ('//', ''), '.tsx': ('//', ''), '.mjs': ('//', ''), '.js': ('//', ''), '.rs': ('//', ''), '.jsonc': ('//', ''),
    '.css': ('/*', ' */'), '.md': ('<!--', ' -->'), '.html': ('<!--', ' -->'), '.svg': ('<!--', ' -->'),
    '.py': ('#', ''), '.yml': ('#', ''), '.yaml': ('#', ''), '.toml': ('#', ''),
}
NAMED = {'.gitignore': ('#', ''), '_headers': ('#', '')}
TSCONFIG = re.compile(r'(^|/)tsconfig[\w.]*\.json$')  # tsconfig files allow comments
SKIP_DIRS = ('data/', 'public/hires/', 'public/dem/', 'public/horizons/', 'public/series/', 'public/terrain/', 'public/tiles/', 'public/moon/', 'node_modules/')
MARK = 'SI disclosure (NASA Space Apps):'

def style(path):
    base = os.path.basename(path)
    if base in NAMED: return NAMED[base]
    if TSCONFIG.search(path): return ('//', '')
    return STYLE.get(os.path.splitext(path)[1])

def line(path):
    c = tally.get(path)
    if c:
        def one(n, k):
            vendor = 'OpenAI' if n == 'OpenAI Codex' else 'Anthropic' + (', model not recorded' if n == 'Claude' else '')
            return f'{n} ({vendor}, {k} commit{"s" if k > 1 else ""})'
        names = [one(n, k) for n, k in c.most_common()]
        who = names[0] if len(names) == 1 else ', '.join(names[:-1]) + ' and ' + names[-1]
        return f'{MARK} written with SI assistance by {who}, under the team\'s direction. Attribution from the commit history.'
    return f'{MARK} no SI-assisted commits are recorded for this file; it was written by the team.'

changed = 0
for path in git(ROOT, 'ls-files').splitlines():
    if path.startswith(SKIP_DIRS) or path == 'scripts/si_disclosure.py': continue
    st = style(path)
    if not st: continue
    full = os.path.join(ROOT, path)
    try: text = open(full, encoding='utf-8').read()
    except (UnicodeDecodeError, FileNotFoundError): continue
    o, c = st
    comment = f'{o} {line(path)}{c}'
    kept = [ln for ln in text.rstrip('\n').split('\n') if MARK not in ln]
    while kept and kept[-1].strip() == '': kept.pop()
    new = '\n'.join(kept) + '\n\n' + comment + '\n'
    if new != text:
        changed += 1
        if DRY: print(path, '::', comment)
        else: open(full, 'w', encoding='utf-8').write(new)
print(f'{"would change" if DRY else "changed"} {changed} files')

# SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
