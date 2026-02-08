const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'squeex.db'));

// Cache meta (small — vid, title, upload_date for all videos)
const meta = {};
for (const row of db.prepare('SELECT vid, title, upload_date FROM videos').iterate()) {
	const yyyymmdd = row.upload_date.toString();
	const year  = yyyymmdd.substring(0, 4);
	const month = yyyymmdd.substring(4, 6);
	const day   = yyyymmdd.substring(6, 8);
	meta[row.vid] = {
		title: row.title,
		upload_date: new Date(year, month - 1, day),
	};
}

// Cache updatedAt
const updatedAt = db.prepare("SELECT value FROM info WHERE key = 'updatedAt'").get().value;

// Prepared statements
const stmtWordMap = db.prepare('SELECT vid, segment_indexes FROM word_map WHERE word = ?');
const stmtSegments = db.prepare('SELECT segments FROM videos WHERE vid = ?');
const stmtAllVideos = db.prepare('SELECT vid, full_text, idx_to_time FROM videos');

// https://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
function escapeRegExp(string) {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getWord(word) {
	const rows = stmtWordMap.all(word.toLowerCase());
	const segmentData = {};

	for (const row of rows) {
		const indexes = JSON.parse(row.segment_indexes);
		const vidRow = stmtSegments.get(row.vid);
		if (!vidRow) continue;
		const allSegments = JSON.parse(vidRow.segments);
		segmentData[row.vid] = allSegments.filter((x, i) => indexes.includes(i));
	}

	return { word, segments: segmentData, meta, updatedAt };
}

function getPhrase(phrase) {
	const regex = new RegExp(escapeRegExp(phrase), 'gi');
	const segmentData = {};

	for (const row of stmtAllVideos.iterate()) {
		const text = row.full_text;
		if (!text) continue;

		const indices = Array.from(text.matchAll(regex)).map(m => m.index);
		if (indices.length === 0) continue;

		const idx_to_time = JSON.parse(row.idx_to_time);

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

			return [startTime, segmentPhrase];
		});

		if (segments.length > 0) segmentData[row.vid] = segments;
	}

	return { word: phrase, segments: segmentData, meta, updatedAt };
}

module.exports = {
	getWord,
	getPhrase,
};
