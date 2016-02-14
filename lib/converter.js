var Workbook = require('./workbook'),
  _ = require('underscore'),
  XLSX = require('xlsx'),
  jsonld = require('jsonld').promises,
  uuid = require('node-uuid'),
  path = require('path'),
  fs = require('fs'),
  md5 = require('md5'),
  Promise = require('bluebird'),
  FileList = require('./filelist'),
  util = require('util');

var Converter = module.exports = function(config) {
  this.desc2buildm = config.desc2buildm;
  this.fileList = new FileList();

  metadataSheet = new Workbook(config.metadataFilePath);
}

Converter.prototype.createPhysicalAssetAsJsonLD = function(dataset) {
  var paJsonLD = {},
    type = 'physical_asset',
    baseUrl = 'http://data.duraark.eu/vocab/buildm/',
    uri = 'http://data.duraark.eu/' + dataset.uri;

  paJsonLD['@id'] = uri;
  // paJsonLD['@type'] = baseUrl + 'PhysicalAsset';

  _.forEach(dataset, function(value, name) {
    if (name && value && name != 'uri' && name != 'fileBaseUrl') { // FIXXME: find a better filtering possibility!
      paJsonLD[baseUrl + name] = {
        '@value': value
          // '@type': item.type
      }
    }
  });

  return {
    jsonld: paJsonLD,
    uri: uri
  }
}

Converter.prototype.createDigitalObjectAsJsonLD = function(fileUrl, paUri, rightsDetails) {
  var doJsonLD = {},
    fileType = fileUrl.split('.').pop(),
    baseUrl = 'http://data.duraark.eu/vocab/buildm/',
    uri;

  if (fileType.toLowerCase() === 'ifc') {
    type = 'ifcspffile';
    uri = 'http://data.duraark.eu/' + type + '_' + md5(fileUrl);
  } else if (fileType.toLowerCase() === 'e57') {
    type = 'e57file';
    uri = 'http://data.duraark.eu/' + type + '_' + md5(fileUrl);
  }

  doJsonLD['@id'] = uri;
  // doJsonLD['@type'] = baseUrl + 'DigitalObject';
  doJsonLD['http://data.duraark.eu/vocab/buildm/represents'] = paUri;
  doJsonLD['http://data.duraark.eu/vocab/buildm/rightsDetails'] = rightsDetails;

  if (rightsDetails.toLowerCase() === 'public') {
    doJsonLD['http://data.duraark.eu/vocab/buildm/filename'] = fileUrl;
  } else {
    doJsonLD['http://data.duraark.eu/vocab/buildm/filename'] = 'undisclosed';
  }

  return {
    jsonld: doJsonLD,
    uri: uri
  }
}

Converter.prototype.jsonld2nquads = function(buildmJSONLD) {
  return jsonld.toRDF(buildmJSONLD, {
    format: 'application/nquads'
  });
}

Converter.prototype.getDatasetFromSheet = function(sheetName, colStr, rowStart, rowEnd) {
  var col = XLSX.utils.decode_col(colStr);
  var rowStart = XLSX.utils.decode_row(rowStart);
  var rowEnd = XLSX.utils.decode_row(rowEnd);
  var titles = metadataSheet.getCols(sheetName, 0, rowStart, rowEnd);
  var dataset = metadataSheet.getCols(sheetName, col, rowStart, rowEnd);
  var zipped = _.zip.apply(_, [titles, dataset]);
  var that = this;

  var dataset = {};
  _.forEach(zipped, function(item) {
    var desc = item[0],
      content = item[1],
      buildmElem = that.desc2buildm[desc];

    if (buildmElem) {
      dataset[buildmElem] = (content) ? content.trim() : content;
    }
  });

  return dataset;
}

Converter.prototype.getDigitalObjectsUrls = function(path, replacement, baseUrl) {
  var that = this;
  return new Promise(function(resolve, reject) {
    that.fileList.getFiles(path, '*').then(function(files) {
      var urls = _.map(files, function(file) {
        return file.replace(replacement, baseUrl);
      });

      resolve(urls);
    });
  });
}

Converter.prototype.writeRDFFile = function(jsonld, uri) {
  this.jsonld2nquads(jsonld).then(function(ntripleString) {
    try {
      fs.mkdirSync('./output');
    } catch (err) {};

    var outputFile = path.join('./output', uri.split('/').pop() + '.ttl');
    // console.log('Writing file: ' + outputFile);

    try {
      fs.writeFileSync(outputFile, ntripleString);
    } catch (err) {
      console.log('Error writing file %s: %s', outputFile, err);
    }
  }).catch(function(err) {
    console.log(err);
  });
};
