var metadataFilePath = './data/2016-02-24_metadata.xlsx',
  paData2buildm = require('./lib/paData2buildm'),
  e57Data2buildm = require('./lib/e57Data2buildm'),
  Workbook = require('./lib/workbook'),
  Converter = require('./lib/converter'),
  FileProvisioner = require('./lib/file-provisioner'),
  fileLocationMap = require('./data/fileLocationMap.json'),
  _ = require('underscore'),
  path = require('path'),
  util = require('util');

var workBook = new Workbook(metadataFilePath);

var converter = new Converter({
    workBook: workBook,
    sheetName: 'MetaData',
    paRowStart: '6',
    paRowEnd: '33',
    e57RowStart: '48',
    e57RowEnd: '60',
    paData2buildm: paData2buildm,
    e57Data2buildm: e57Data2buildm,
    buildmBaseUrl: 'http://data.duraark.eu/vocab/buildm/'
  }),
  insertIntoSDAS = false,
  cols = ['AA', 'AD', 'AI', 'AJ', 'AK', 'AL', 'AV', 'AZ', 'BA', 'BC', 'BL', 'BM', 'BN', 'BQ', 'BS', 'BT', 'BU', 'BW', 'BZ', 'CD', 'CI'];
  // cols = ['AI'];

var fileProvisioner = new FileProvisioner({
  dryRun: false
});

_.forEach(cols, function(col) {
  // fileProvisioner.provisionFiles({
  //   col: col,
  //   rowStart: '62',
  //   rowEnd: '67',
  //   keyMap: fileLocationMap,
  //   workBook: workBook
  // });

  // return;

  var paDataset = converter.getPADataFromSheet(col),
    e57Dataset = converter.getE57DataFromSheet(col),
    name = paDataset.name;

  if (name) {
    console.log('Processing physical asset: %s [row: %s]', name, col);

    var paJsonLD = converter.createPhysicalAssetAsJsonLD(paDataset);

    var e57sJsonLD = [];

    var filePathRootAFS = workBook.getCell('MetaData', col, '67'),
      subSampleRate = workBook.getCell('MetaData', col, '63'),
      filePathRootAFS = filePathRootAFS.replace('~/duraark-sessions', '/afs/cgv.tugraz.at/Fraunhofer/Projekte/DuraArK/datasets/sessions'); // FIXXME: make configurable!

    // console.log('filePathRootAFS: ' + filePathRootAFS);

    var basePathTIB = '/tmp/duraark-data' + paDataset.fileBaseUrl + '/';

    converter.getDigitalObjectsUrls(basePathTIB).then(function(filePathsTIB) {
      _.forEach(filePathsTIB, function(filePathTIB) {
        // console.log('    adding file: ' + filePath);
        var ext = path.extname(filePathTIB).toLowerCase();

        if (ext !== '.zip') {

          var filePathAFS = null;

          if (ext === '.e57') {
            var filename = filePathTIB.split('/').pop();
            filename = path.basename(filePathTIB, ext) + '-' + subSampleRate + '.e57n';
            filePathAFS = path.join(filePathRootAFS, 'master', filename);
          } else {
            filePathAFS = path.join(filePathRootAFS, 'derivative_copy', filePathTIB.split('/').pop());
          }

          // console.log('filePathTIB: ' + filePathTIB);
          // console.log('filePathAFS: ' + filePathAFS);

          var e57JsonLD = converter.createE57AsJsonLD(filePathTIB, filePathAFS, e57Dataset, paJsonLD.uri, paDataset.rightsDetails, '/tmp/duraark-data'); // FIXXME: javascriptify parameters! // FIXXME: make configurable!

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
