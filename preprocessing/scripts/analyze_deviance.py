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
    'uhuh', 'yaho', 'asmin', 'ellm', 'grber', 'hased', 'pbus',
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
# 5. Phrase analysis (bigrams from full text data)
# ---------------------------------------------------------------------------
import re
from datetime import datetime

FULL_PATH = os.path.join(REPO_ROOT, 'app', 'data', 'squeex_full.json')
meta = data['meta']

bigram_counts = Counter()
try:
    with open(FULL_PATH) as f:
        full_data = json.load(f)

    for vid, vid_data in full_data.items():
        text = vid_data.get('text', '')
        words = re.findall(r'[a-z]+', text.lower())
        for i in range(len(words) - 1):
            a, b = words[i], words[i + 1]
            if len(a) < 3 or len(b) < 3:
                continue
            bigram_counts[f"{a} {b}"] += 1
except Exception as e:
    print(f"Skipping phrase analysis: {e}")
    full_data = {}

# Filter bigrams: keep only those where at least one word is "deviant"
# (i.e., appears in our top results), making phrases Squeex-specific
MIN_BIGRAM_COUNT = 20
deviant_words = set(w for w, *_ in results[:200])

# Also skip phrases where both words are very common English
COMMON_WORDS = {
    'the', 'and', 'that', 'this', 'with', 'you', 'for', 'are', 'was',
    'but', 'not', 'have', 'has', 'had', 'they', 'them', 'their', 'his',
    'her', 'she', 'its', 'our', 'can', 'will', 'all', 'get', 'got',
    'just', 'been', 'what', 'when', 'how', 'who', 'know', 'like',
    'going', 'want', 'need', 'would', 'could', 'should', 'from',
    'into', 'about', 'than', 'more', 'some', 'out', 'also', 'back',
    'right', 'thank', 'yeah', 'yes', 'really', 'very', 'well',
    'here', 'there', 'then', 'now', 'thing', 'things', 'guys',
    'think', 'said', 'way', 'come', 'take', 'make', 'look', 'see',
}

# Score bigrams: boost if either word is deviant (Squeex-specific)
scored_phrases = []
for bg, c in bigram_counts.most_common(5000):
    if c < MIN_BIGRAM_COUNT:
        continue
    words = bg.split()
    if any(w in BLOCKLIST for w in words):
        continue
    if all(w in COMMON_WORDS for w in words):
        continue
    # Skip truncated contractions (don, didn, wasn, etc.)
    if any(w in {'don', 'didn', 'wasn', 'isn', 'won', 'doesn', 'couldn', 'wouldn', 'shouldn', 'hasn', 'aren', 'weren', 'ain', 'let'} for w in words):
        continue
    # Skip if any word is too short or both words are the same
    if any(len(w) < 3 for w in words):
        continue
    if words[0] == words[1]:
        continue
    # Score: heavily favor phrases with Squeex-specific words
    # A word is "specific" if it's not in the top 5000 English words
    specific = sum(1 for w in words if english_counts.get(w, 0) < english_total * 0.00001)
    if specific == 0:
        continue  # Skip if both words are common English
    score = c * (100 ** specific)
    scored_phrases.append((bg, c, score))

scored_phrases.sort(key=lambda x: x[2], reverse=True)

# Deduplicate similar phrases (match on first 2 chars of each word)
seen_phrase_keys = set()
top_phrases = []
for bg, c, _ in scored_phrases:
    key = tuple(sorted(w[:2] for w in bg.split()))
    if key in seen_phrase_keys:
        continue
    seen_phrase_keys.add(key)
    top_phrases.append((bg, c))
    if len(top_phrases) >= 30:
        break

if top_phrases:
    print(f"\nTop phrases:")
    for i, (phrase, count) in enumerate(top_phrases[:15]):
        print(f"  {i+1}. '{phrase}' ({count})")

# ---------------------------------------------------------------------------
# 6. Trending analysis — words more common in recent VODs vs older ones
# ---------------------------------------------------------------------------
# Split videos into recent half and older half by upload date
vid_dates = {}
for vid, m in meta.items():
    try:
        d = m['upload_date']
        if isinstance(d, int):
            ds = str(d)
            vid_dates[vid] = datetime(int(ds[:4]), int(ds[4:6]), int(ds[6:8]))
        else:
            vid_dates[vid] = datetime.fromisoformat(str(d))
    except:
        pass

if vid_dates:
    sorted_vids = sorted(vid_dates.items(), key=lambda x: x[1])
    midpoint = len(sorted_vids) // 2
    old_vids = set(v for v, _ in sorted_vids[:midpoint])
    new_vids = set(v for v, _ in sorted_vids[midpoint:])

    old_counts = Counter()
    new_counts = Counter()
    for word, vids in word_map.items():
        for vid, seg_indexes in vids.items():
            if vid in old_vids:
                old_counts[word] += len(seg_indexes)
            elif vid in new_vids:
                new_counts[word] += len(seg_indexes)

    old_total = max(sum(old_counts.values()), 1)
    new_total = max(sum(new_counts.values()), 1)

    trending = []
    for word in set(old_counts.keys()) | set(new_counts.keys()):
        if len(word) < MIN_WORD_LENGTH or not word.isalpha() or word in BLOCKLIST:
            continue
        old_freq = old_counts.get(word, 0) / old_total
        new_freq = new_counts.get(word, 0) / new_total
        # Must appear enough in recent VODs and be meaningfully more frequent
        if new_counts.get(word, 0) < 10:
            continue
        if old_freq == 0:
            ratio = 50.0  # cap for new words
        else:
            ratio = new_freq / old_freq
        if ratio > 1.5:
            trending.append((word, ratio, new_counts.get(word, 0), old_counts.get(word, 0)))

    trending.sort(key=lambda x: x[1], reverse=True)

    print(f"\nTrending words (recent vs older VODs):")
    for i, (word, ratio, nc, oc) in enumerate(trending[:15]):
        print(f"  {i+1}. '{word}' {ratio:.1f}x more frequent (new:{nc}, old:{oc})")

# ---------------------------------------------------------------------------
# 7. Generate suggestions.json for the static site
# ---------------------------------------------------------------------------
top_words = [w for w, *_ in results]
pills = top_words[:8]
random_words = [w for w in top_words[8:] if w not in pills][:30]

# Trending and phrases — larger lists
trending_words = [w for w, *_ in trending[:30]] if vid_dates else []
phrase_suggestions = [p for p, _ in top_phrases[:15]] if top_phrases else []

suggestions = {
    'pills': pills,
    'random': random_words,
    'trending': [w for w in trending_words if w not in pills and w not in random_words][:20],
    'phrases': phrase_suggestions,
}

out_path = os.path.join(REPO_ROOT, 'suggestions.json')
with open(out_path, 'w') as f:
    json.dump(suggestions, f, indent=2)
print(f"\nWrote {out_path}")
print(f"  pills:    {suggestions['pills']}")
print(f"  random:   {suggestions['random']}")
print(f"  trending: {suggestions['trending']}")
print(f"  phrases:  {suggestions['phrases']}")
