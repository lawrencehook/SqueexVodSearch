import sys
import webvtt
import re
import json

import nltk
# nltk.download('stopwords')
from nltk.corpus import stopwords
sw = stopwords.words('english')

'''
Notes

output:
    - id: the video ID
    - segments: a list of segments as they appear in the vtt file
    - word_map: a dictionary that maps a word to a list of indexes in which it appears in the segments list
    - upload_date

segment object:
    [start time, text]
'''

def get_sec(time_str):
    """Get seconds from time."""
    h, m, s = re.sub(r'\..*$', '', time_str).split(':')
    return int(h) * 3600 + int(m) * 60 + int(s)

if __name__ == '__main__':

    if len(sys.argv) < 2:
        print('Expected 1 command line paramter (vtt file path). Exiting...')
        sys.exit(1)

    # Get all upload dates by video id.
    dates = {}
    with open('data/dates.txt') as dates_file:
        for line in dates_file.readlines():
            vid, date = line.strip().split(':')
            dates[vid] = int(date)

    # Get video ID from filename.
    p = re.compile(r'\[([^\[]*?)\]\.en\.vtt')
    vtt_filename = sys.argv[1]
    vid = p.search(vtt_filename).group(1)
    upload_date = dates[vid]

    # Parse vtt file
    segments = []
    word_map = {}
    seen_starts = set()
    for caption in webvtt.read(vtt_filename):

        start = get_sec(caption.start)
        text = re.sub(r'\[.*?\]', '', caption.text).strip().lower()

        if '\n' in text: continue
        if text == '': continue
        if start in seen_starts: continue
        if len(segments) > 0 and text == segments[-1][1]: continue

        seen_starts.add(start)
        segments.append([ start, text ])

        idx = len(segments) - 1
        words = text.split()
        for word in words:
            if word in sw: continue
            if word in word_map:
                word_map[word].add(idx)
            else:
                word_map[word] = { idx }


    # Convert sets to lists, for the json export
    for word, idxs in word_map.items():
        word_map[word] = list(idxs)


    # Export parsed data to json
    print(json.dumps({
        'id': vid,
        'segments': segments,
        'word_map': word_map,
        'upload_date': upload_date
    }))
    # }, indent=2))
