var express = require('express');
var router = express.Router();
var getWord = require('../lib/get-word');


/* GET a word */
router.get('/:word', function(req, res, next) {
  const { word } = req.params;
  console.log(word);

  res.json(getWord(word));
});


module.exports = router;
