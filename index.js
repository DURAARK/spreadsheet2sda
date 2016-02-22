var metadataFilePath = './data/2016-02-13_metadata.xlsx',
  paData2buildm = require('./lib/paData2buildm'),
  e57Data2buildm = require('./lib/e57Data2buildm'),
  Converter = require('./lib/converter'),
  _ = require('underscore'),
  util = require('util');

var converter = new Converter({
    metadataFilePath: metadataFilePath,
    sheetName: 'MetaData',
    paRowStart: '6',
    paRowEnd: '32',
    e57RowStart: '48',
    e57RowEnd: '60',
    paData2buildm: paData2buildm,
    e57Data2buildm: e57Data2buildm,
    buildmBaseUrl: 'http://data.duraark.eu/vocab/buildm/'
  }),
  insertIntoSDAS = false,
  cols = ['AA', 'AD', 'AI', 'AJ', 'AK', 'AL', 'AV', 'AZ', 'BA', 'BC', 'BL', 'BM', 'BN', 'BQ', 'BS', 'BT', 'BU', 'BW', 'BZ', 'CD', 'CI'];
  // cols = ['AJ'];

_.forEach(cols, function(col) {
  var paDataset = converter.getPADataFromSheet(col),
    e57Dataset = converter.getE57DataFromSheet(col),
    name = paDataset.name;

  if (name) {
    console.log('Processing physical asset: %s [row: %s]', name, col);

    var paJsonLD = converter.createPhysicalAssetAsJsonLD(paDataset);

    var e57sJsonLD = [];

    var basePath = '/tmp/duraark-data' + paDataset.fileBaseUrl + '/';

    converter.getDigitalObjectsUrls(basePath).then(function(filePaths) {
      _.forEach(filePaths, function(filePath) {
        // console.log('    adding file: ' + filePath);
        if (filePath.split('.').pop().toLowerCase() !== 'zip') {
          var e57JsonLD = converter.createE57AsJsonLD(filePath, e57Dataset, paJsonLD.uri, paDataset.rightsDetails, '/tmp/duraark-data'); // FIXXME: javascriptify parameters!

          if (!paJsonLD.jsonld['http://data.duraark.eu/vocab/buildm/isRepresentedBy']) {
            paJsonLD.jsonld['http://data.duraark.eu/vocab/buildm/isRepresentedBy'] = [];
          }

          paJsonLD.jsonld['http://data.duraark.eu/vocab/buildm/isRepresentedBy'].push({
            '@value': e57JsonLD.uri
          });

          e57sJsonLD.push(e57JsonLD);
        }
      });

      converter.writeWorkbenchUISessionFile(paJsonLD, e57sJsonLD);

      var tmp = [];
      _.forEach(e57sJsonLD, function(item) {
        // delete item.jsonld['@type']; // the SDAVer does not cope with the @type predicate
        tmp.push(item.jsonld);
      });
      // delete paJsonLD.jsonld['@type']; // the SDAVer does not cope with the @type predicate
      tmp.push(paJsonLD.jsonld);

      converter.writeRDFFile(tmp, paJsonLD.uri).then(function(rdfFilePath) {
        if (insertIntoSDAS) {
          converter.insertIntoSDAS(rdfFilePath).then(function() {
            console.log('Successfully inserted data into the SDAS');
          }).catch(function(err) {
            console.log('ERROR inserting data into the SDAS for: ' + rdfFilePath);
          });
        }
      });
    });
  } else {
    console.log('Skipping bogus data from col: ' + col);
  }
});
