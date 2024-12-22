import sys
import os
import json
import re
from datetime import datetime

'''
Notes: create a single json object that stores all relevant data

Format:
{

	segments: {
		[vid]: [ segments ]
	},

	word_map: {
		[word]: { [vid]: [ segment indexes ] }
	},

	meta: {
		[vid]: {
			title,
			upload_date,
		}
	},

	updatedAt
}

Extended:
{
	full: {
		[vid]: {
			text: '',
			idx_to_time: { ... }
		}
	}
}

'''

if __name__ == '__main__':

	path = 'data/parsed'
	files = os.listdir(path)

	final_segments = {}
	final_word_map = {}
	full_text_obj = {}
	meta = {}
	for filename in files:
		if not 'json' in filename: continue
		filepath = os.path.join(path, filename)

		with open(filepath, 'r') as file:
			try:
				data = json.load(file)
			except Exception as e:
				print(e)
				print(filename)
				sys.exit(1)

			vid = data['id']
			segments = data['segments']
			word_map = data['word_map']
			full_text = data['full_text']
			idx_to_time = data['idx_to_time']
			upload_date = data['upload_date']
			title = re.sub(r' \[.*$', '', filename)

			final_segments[vid] = segments
			meta[vid] = {
				'upload_date': upload_date,
				'title': title
			}

			for word in word_map:
				if word in final_word_map:
					final_word_map[word][vid] = word_map[word]
				else:
					final_word_map[word] = {
						vid: word_map[word]
					}

			full_text_obj[vid] = {
				'text': full_text,
				'idx_to_time': idx_to_time
			}

	output = {
		'segments': final_segments,
		'word_map': final_word_map,
		'meta': meta,
		'updatedAt': str(datetime.now())
	}

	# print(json.dumps(output, indent=2))
	# print(json.dumps(final_segments, indent=2))


	with open('data/final.json', 'w') as f:
		json.dump(output, f)

	with open('data/full.json', 'w') as f:
		json.dump(full_text_obj, f)
