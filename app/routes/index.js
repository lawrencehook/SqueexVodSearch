var express = require('express');
var router = express.Router();
var { getWord, getPhrase } = require('../lib/get');


/* GET query */
router.get('/:query', function(req, res, next) {
  const start = Date.now();
  const { query } = req.params;

  // return res.json(getPhrase(query));
  const hasSpace = query.trim().includes(' ');
  const results = hasSpace ? getPhrase(query) : getWord(query);
  let numResults = 0;
  let numVideos = 0;

  // log some stats
  if (results.segments) {
    numVideos = Object.values(results.segments).length;
    numResults = Object.values(results.segments).flat(1).length;
  }
  const end = Date.now();
  logResults(end-start, query, numResults, numVideos);
  return res.json(results);
});

function logResults(timeTaken, query, numResults, numVideos) {
  const timestamp = new Date().toLocaleString();
  const col1 = `${timeTaken}ms`.padStart(5);
  const col2 = `${query}`.padEnd(50);
  const col3 = `${numResults} results`.padStart(15);
  const col4 = `${numVideos} videos`.padStart(15);
  console.log(`${timestamp} | ${col1} | ${col2} | ${col3} | ${col4} |`);
}


module.exports = router;
