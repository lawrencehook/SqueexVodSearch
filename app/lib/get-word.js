const fs = require('fs');

const d = fs.readFileSync('data/squeex.json');
const parsed = JSON.parse(d);
const { segments, word_map, meta, updatedAt } = parsed;

Object.values(meta).forEach(obj => {
	obj.upload_date = toDate(obj.upload_date);
})

function toDate(yyyymmdd) {
	yyyymmdd = yyyymmdd.toString();
	const year  = yyyymmdd.substring(0,4);
	const month = yyyymmdd.substring(4,6);
	const day   = yyyymmdd.substring(6,8);
	return new Date(year, month-1, day);
}

function getWord(word) {
	const wordData = word_map[word.toLowerCase()];
	const segmentData = {};
	const metadata = {};
	Object.entries(wordData).forEach(([id, indexes]) => {
		segmentData[id] = segments[id].filter((x, i) => indexes.includes(i));
	});

	return { word, segments: segmentData, meta, updatedAt };
}

module.exports = getWord;
