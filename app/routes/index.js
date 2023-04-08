var express = require('express');
var router = express.Router();
var { getWord, getPhrase } = require('../lib/get');


/* GET query */
router.get('/:query', function(req, res, next) {
  const { query } = req.params;
  console.log(query);

  // return res.json(getPhrase(query));
  if (query.trim().includes(' ')) {
    return res.json(getPhrase(query));
  } else {
    res.json(getWord(query));
  }
});


module.exports = router;
