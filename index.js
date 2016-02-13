var metadataFilePath = './data/2016-02-13_metadata.xlsx',
  desc2buildm = require('./lib/desc2buildm'),
  Converter = require('./lib/converter'),
  _ = require('underscore'),
  path = require('path'),
  fs = require('fs');

var converter = new Converter({
    metadataFilePath: metadataFilePath,
    desc2buildm: desc2buildm
  }),
  cols = ['AA', 'AD', 'AI', 'AJ', 'AK', 'AL', 'AV', 'AZ', 'BA', 'BC', 'BL', 'BM', 'BN', 'BQ', 'BS', 'BT', 'BU', 'BW', 'BZ', 'CD', 'CI'];

_.forEach(cols, function(col) {
  var dataset = converter.getDatasetFromSheet('MetaData', col, '10', '32'),
    name = dataset.name;

  if (name) {
    console.log('Processing physical asset: ' + name);

    var buildm = converter.dataset2JSONLD(dataset);

    converter.jsonld2nquads(buildm.jsonld).then(function(ntripleString, uri) {
      try {
        fs.mkdirSync('./output');
      } catch (err) {};

      var outputFile = path.join('./output', buildm.uri.split('/').pop() + '.ttl');
      // console.log('Writing file: ' + outputFile);

      try {
        fs.writeFileSync(outputFile, ntripleString);
      } catch (err) {
        console.log('Error writing file %s: %s', outputFile, err);
      }

      // var lines = ntripleString.split('.\n');
      // _.forEach(lines, function(line) {
      //   console.log('     ' + line);
      // });
    }).catch(function(err) {
      console.log(err);
    });
  } else {
    console.log('Skipping bogus data from col: ' + col);
  }
});
