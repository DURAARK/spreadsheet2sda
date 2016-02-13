var metadataFilePath = './data/2016-02-13_metadata.xlsx',
  desc2buildm = require('./lib/desc2buildm'),
  Converter = require('./lib/converter'),
  _ = require('underscore'),
  util = require('util');

var converter = new Converter({
    metadataFilePath: metadataFilePath,
    desc2buildm: desc2buildm
  }),
  cols = ['AA', 'AD', 'AI', 'AJ', 'AK', 'AL', 'AV', 'AZ', 'BA', 'BC', 'BL', 'BM', 'BN', 'BQ', 'BS', 'BT', 'BU', 'BW', 'BZ', 'CD', 'CI'];
  // cols = ['AA'];

_.forEach(cols, function(col) {
  var dataset = converter.getDatasetFromSheet('MetaData', col, '9', '32'),
    name = dataset.name;

  if (name) {
    console.log('Processing physical asset: ' + name);

    var paJsonLD = converter.createPhysicalAssetAsJsonLD(dataset);

    var dosJsonLD = [];

    var basePath = '/tmp/duraark-data' + dataset.fileBaseUrl + '/';

    converter.getDigitalObjectsUrls(basePath, '/tmp/duraark-data', 'http://duraark.tib.eu').then(function(urls) {
      _.forEach(urls, function(url) {
        // console.log('processing URL: ' + url);

        var doJsonLD = converter.createDigitalObjectAsJsonLD(url, paJsonLD.uri);

        if (!paJsonLD.jsonld['http://data.duraark.eu/vocab/buildm/isRepresentedBy']) {
          paJsonLD.jsonld['http://data.duraark.eu/vocab/buildm/isRepresentedBy'] = [];
        }

        paJsonLD.jsonld['http://data.duraark.eu/vocab/buildm/isRepresentedBy'].push({
          '@value': doJsonLD.uri
        });

        dosJsonLD.push(doJsonLD.jsonld);
      });

      var tmp = [paJsonLD.jsonld];
      _.forEach(dosJsonLD, function(item) {
        tmp.push(item);
      });

      converter.writeRDFFile(tmp, paJsonLD.uri);
    });
  } else {
    console.log('Skipping bogus data from col: ' + col);
  }
});
