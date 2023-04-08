const fs = require('fs');

const d = fs.readFileSync('data/squeex.json');
const parsed = JSON.parse(d);
const { segments, word_map, meta, updatedAt } = parsed;
Object.values(meta).forEach(obj => {
	obj.upload_date = toDate(obj.upload_date);
});


// const Text = require('../models/text.js');
const full = JSON.parse(fs.readFileSync('data/squeex_full.json'));
const vids = Object.keys(full)


function toDate(yyyymmdd) {
	yyyymmdd = yyyymmdd.toString();
	const year  = yyyymmdd.substring(0,4);
	const month = yyyymmdd.substring(4,6);
	const day   = yyyymmdd.substring(6,8);
	return new Date(year, month-1, day);
}

// https://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function getWord(word) {
	const wordData = word_map[word.toLowerCase()];
	const segmentData = {};
	Object.entries(wordData).forEach(([id, indexes]) => {
		segmentData[id] = segments[id].filter((x, i) => indexes.includes(i));
	});

	return { word, segments: segmentData, meta, updatedAt };
}

function getPhrase(phrase) {
	const regex = new RegExp(escapeRegExp(phrase), 'gi');
	const segmentData = {};

	Object.entries(full).forEach(([vid, { text, idx_to_time }]) => {

		const indices = Array.from(text.matchAll(regex)).map(m => m.index);
		const segments = indices.map(index => {
			let dec = 0;
			while (index - dec > 0 && !((index - dec) in idx_to_time)) {
				dec += 1;
			}

			let inc = phrase.length;
			while (index + inc < text.length && !((index + inc) in idx_to_time)) {
				inc += 1;
			}

			const startIndex = index - dec;
			const endIndex = index + inc;

			const startTime = idx_to_time[startIndex] || 0;
			const segmentPhrase = text.substring(startIndex, endIndex).trim();

			// console.log(segmentPhrase, startIndex, endIndex, index, phrase.length);
			return [startTime, segmentPhrase];
		});

		if (segments.length > 0) segmentData[vid] = segments;
	});

	return { word: phrase, segments: segmentData, meta, updatedAt };
}

module.exports = {
	getWord,
	getPhrase,
};
