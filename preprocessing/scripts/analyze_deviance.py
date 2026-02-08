"""
Finds words in Squeex's VODs that are unusually frequent compared to
standard English. Uses log-ratio of observed frequency vs expected
frequency from a general English word frequency list.

Downloads a public word frequency list (based on Google's Trillion Word
Corpus) for the English baseline — no nltk required.

Outputs the top N words ranked by "deviance":
    deviance = log2( squeex_freq / english_freq )

Usage:
    python3 preprocessing/scripts/analyze_deviance.py
"""

import json
import math
import urllib.request
import os
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))

# ---------------------------------------------------------------------------
# 1. Load Squeex word_map from the final data
# ---------------------------------------------------------------------------
DATA_PATH = os.path.join(REPO_ROOT, 'app', 'data', 'squeex.json')

with open(DATA_PATH) as f:
    data = json.load(f)

word_map = data['word_map']

# Count total mentions per word (sum of segment appearances across all videos)
squeex_counts = Counter()
for word, vids in word_map.items():
    for vid, seg_indexes in vids.items():
        squeex_counts[word] += len(seg_indexes)

squeex_total = sum(squeex_counts.values())
print(f"Squeex corpus: {len(squeex_counts)} unique words, {squeex_total} total mentions")

# ---------------------------------------------------------------------------
# 2. Build English frequency baseline
#    Source: https://norvig.com/ngrams/count_1w.txt (Peter Norvig / Google)
# ---------------------------------------------------------------------------
FREQ_CACHE = os.path.join(SCRIPT_DIR, 'english_freq_cache.txt')
FREQ_URL = 'https://norvig.com/ngrams/count_1w.txt'

if not os.path.exists(FREQ_CACHE):
    print(f"Downloading English word frequencies from {FREQ_URL} ...")
    urllib.request.urlretrieve(FREQ_URL, FREQ_CACHE)
    print("Done.")

english_counts = Counter()
with open(FREQ_CACHE) as f:
    for line in f:
        parts = line.strip().split('\t')
        if len(parts) == 2:
            word, count = parts[0].lower(), int(parts[1])
            english_counts[word] = count

english_total = sum(english_counts.values())
print(f"English corpus (Norvig/Google): {len(english_counts)} unique words, {english_total} total words")

# ---------------------------------------------------------------------------
# 3. Compute deviance for each word
#
#    deviance = log2( squeex_freq / english_freq )
#
#    For words not in English corpus, use a smoothed frequency so they
#    rank high but don't cause division by zero.
# ---------------------------------------------------------------------------
MIN_SQUEEX_MENTIONS = 10
MIN_WORD_LENGTH = 4
SMOOTHED_ENGLISH_FREQ = 0.5 / english_total

# Words to skip — subtitle artifacts, misspellings, fragments
BLOCKLIST = {
    'sque', 'lwig', 'squex', 'squix', 'squak', 'squaks', 'squax',
    'squami', 'ramasami', 'sioban', 'uhhuh', 'turle', 'vivic',
    'preo', 'speedr', 'stardo', 'morz', 'godamn', 'giting',
    'doie', 'bazu', 'bazoo', 'chibli', 'chibly', 'glorp',
    'valerant', 'valerent', 'wamps', 'womps', 'gooper',
}

results = []
for word, count in squeex_counts.items():
    if count < MIN_SQUEEX_MENTIONS:
        continue
    if len(word) < MIN_WORD_LENGTH:
        continue
    if not word.isalpha():
        continue
    if word in BLOCKLIST:
        continue

    squeex_freq = count / squeex_total
    if word in english_counts:
        english_freq = english_counts[word] / english_total
    else:
        english_freq = SMOOTHED_ENGLISH_FREQ

    deviance = math.log2(squeex_freq / english_freq)
    results.append((word, deviance, count, squeex_freq, english_freq))

results.sort(key=lambda x: x[1], reverse=True)

# ---------------------------------------------------------------------------
# 4. Output
# ---------------------------------------------------------------------------
print(f"\n{'RANK':<6} {'WORD':<20} {'DEVIANCE':>10} {'SQUEEX #':>10} {'SQUEEX %':>10} {'ENGLISH %':>10}")
print("-" * 70)
for i, (word, dev, count, sf, ef) in enumerate(results[:80]):
    print(f"{i+1:<6} {word:<20} {dev:>10.2f} {count:>10} {sf*100:>9.4f}% {ef*100:>9.6f}%")

# ---------------------------------------------------------------------------
# 5. Generate suggestions.json for the static site
#    - pills: top 6 words shown as suggestion buttons
#    - random: top 20 words used for random search on page load
# ---------------------------------------------------------------------------
top_words = [w for w, *_ in results]
pills = top_words[:6]
random_words = [w for w in top_words[6:] if w not in pills][:20]
suggestions = {
    'pills': pills,
    'random': random_words,
}

out_path = os.path.join(REPO_ROOT, 'suggestions.json')
with open(out_path, 'w') as f:
    json.dump(suggestions, f, indent=2)
print(f"\nWrote {out_path}")
print(f"  pills:  {suggestions['pills']}")
print(f"  random: {suggestions['random']}")
