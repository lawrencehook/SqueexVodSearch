import json
import sqlite3
import os
from datetime import datetime

"""
Reads merged JSON files (data/final.json + data/full.json) and creates
a SQLite database (data/squeex.db) for the Express API server.
"""

DB_PATH = 'data/squeex.db'
FINAL_PATH = 'data/final.json'
FULL_PATH = 'data/full.json'

if __name__ == '__main__':
    print('Loading merged JSON...')
    with open(FINAL_PATH, 'r') as f:
        final = json.load(f)
    with open(FULL_PATH, 'r') as f:
        full = json.load(f)

    segments = final['segments']
    word_map = final['word_map']
    meta = final['meta']
    updatedAt = final['updatedAt']

    # Remove old DB if it exists
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    print('Creating SQLite database...')
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute('''CREATE TABLE videos (
        vid TEXT PRIMARY KEY,
        title TEXT,
        upload_date INTEGER,
        segments TEXT,
        full_text TEXT,
        idx_to_time TEXT
    )''')

    c.execute('''CREATE TABLE word_map (
        word TEXT,
        vid TEXT,
        segment_indexes TEXT,
        PRIMARY KEY (word, vid)
    )''')
    c.execute('CREATE INDEX idx_word ON word_map(word)')

    c.execute('''CREATE TABLE info (
        key TEXT PRIMARY KEY,
        value TEXT
    )''')

    # Insert videos
    print(f'Inserting {len(meta)} videos...')
    for vid, m in meta.items():
        vid_segments = segments.get(vid, [])
        vid_full = full.get(vid, {})
        full_text = vid_full.get('text', '')
        idx_to_time = vid_full.get('idx_to_time', {})

        c.execute('INSERT INTO videos VALUES (?, ?, ?, ?, ?, ?)', (
            vid,
            m['title'],
            m['upload_date'],
            json.dumps(vid_segments),
            full_text,
            json.dumps(idx_to_time)
        ))

    # Insert word_map
    word_count = 0
    print(f'Inserting word map ({len(word_map)} words)...')
    for word, vids in word_map.items():
        for vid, indexes in vids.items():
            c.execute('INSERT INTO word_map VALUES (?, ?, ?)', (
                word, vid, json.dumps(indexes)
            ))
            word_count += 1

    # Insert info
    c.execute('INSERT INTO info VALUES (?, ?)', ('updatedAt', updatedAt))

    conn.commit()
    conn.close()

    size_mb = os.path.getsize(DB_PATH) / (1024 * 1024)
    print(f'Done. {DB_PATH} created ({size_mb:.1f} MB, {len(meta)} videos, {word_count} word-vid entries)')
