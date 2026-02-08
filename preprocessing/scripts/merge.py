import json
import os
import sys

"""
Merges newly generated data (data/final.json, data/full.json) with
existing server data (../app/data/squeex.json, ../app/data/squeex_full.json).

New data takes precedence for overlapping video IDs.
Result is written back to data/final.json and data/full.json.
"""

EXISTING_FINAL = '../app/data/squeex.json'
EXISTING_FULL = '../app/data/squeex_full.json'
NEW_FINAL = 'data/final.json'
NEW_FULL = 'data/full.json'

if __name__ == '__main__':
    if not os.path.exists(EXISTING_FINAL):
        print(f'{EXISTING_FINAL} not found, skipping merge.')
        sys.exit(0)

    print('Loading existing server data...')
    with open(EXISTING_FINAL, 'r') as f:
        existing = json.load(f)
    with open(EXISTING_FULL, 'r') as f:
        existing_full = json.load(f)

    print('Loading new data...')
    with open(NEW_FINAL, 'r') as f:
        new = json.load(f)
    with open(NEW_FULL, 'r') as f:
        new_full = json.load(f)

    # Start with existing data as the base, then overlay new data.
    # New data takes precedence for overlapping video IDs.

    # Segments: merge by video ID
    merged_segments = {**existing['segments'], **new['segments']}

    # Meta: merge by video ID
    merged_meta = {**existing['meta'], **new['meta']}

    # Full text: merge by video ID
    merged_full = {**existing_full, **new_full}

    # Word map: merge per word, per video ID
    merged_word_map = {}
    for word, vids in existing['word_map'].items():
        merged_word_map[word] = dict(vids)
    for word, vids in new['word_map'].items():
        if word in merged_word_map:
            merged_word_map[word].update(vids)
        else:
            merged_word_map[word] = dict(vids)

    # Remove any word_map entries for video IDs not in merged_segments.
    # This cleans up stale references.
    for word in list(merged_word_map.keys()):
        merged_word_map[word] = {
            vid: idxs for vid, idxs in merged_word_map[word].items()
            if vid in merged_segments
        }
        if not merged_word_map[word]:
            del merged_word_map[word]

    existing_only = len(existing['meta']) - len(set(existing['meta']) & set(new['meta']))
    new_only = len(new['meta']) - len(set(existing['meta']) & set(new['meta']))
    overlap = len(set(existing['meta']) & set(new['meta']))
    print(f'Existing: {len(existing["meta"])} videos')
    print(f'New: {len(new["meta"])} videos')
    print(f'Overlap: {overlap} videos')
    print(f'Merged: {len(merged_meta)} videos')

    output = {
        'segments': merged_segments,
        'word_map': merged_word_map,
        'meta': merged_meta,
        'updatedAt': new['updatedAt']
    }

    print('Writing merged data...')
    with open(NEW_FINAL, 'w') as f:
        json.dump(output, f)
    with open(NEW_FULL, 'w') as f:
        json.dump(merged_full, f)

    print('Merge complete.')
