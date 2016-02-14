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
  spawn = require('child_process').spawn,
  util = require('util');

var Converter = module.exports = function(config) {
  this.paData2buildm = config.paData2buildm;
  this.e57Data2buildm = config.e57Data2buildm;

  this.sheetName = config.sheetName;

  this.paRowStart = config.paRowStart;
  this.paRowEnd = config.paRowEnd;

  this.e57RowStart = config.e57RowStart;
  this.e57RowEnd = config.e57RowEnd;

  this.metadataSheet = new Workbook(config.metadataFilePath);
  this.fileList = new FileList();
}

Converter.prototype.getPADataFromSheet = function(colStr) {
  var col = XLSX.utils.decode_col(colStr);
  var rowStart = XLSX.utils.decode_row(this.paRowStart);
  var rowEnd = XLSX.utils.decode_row(this.paRowEnd);
  var titles = this.metadataSheet.getCols(this.sheetName, 0, rowStart, rowEnd);
  var dataset = this.metadataSheet.getCols(this.sheetName, col, rowStart, rowEnd);
  var zipped = _.zip.apply(_, [titles, dataset]);
  var that = this;

  var dataset = {};
  _.forEach(zipped, function(item) {
    var desc = item[0],
      content = item[1],
      buildmElem = that.paData2buildm[desc];

    if (buildmElem) {
      dataset[buildmElem] = (content) ? content.trim() : content;
    }
  });

  return dataset;
}

Converter.prototype.getE57DataFromSheet = function(colStr) {
  var col = XLSX.utils.decode_col(colStr);
  var rowStart = XLSX.utils.decode_row(this.e57RowStart);
  var rowEnd = XLSX.utils.decode_row(this.e57RowEnd);
  var titles = this.metadataSheet.getCols(this.sheetName, 0, rowStart, rowEnd);
  var dataset = this.metadataSheet.getCols(this.sheetName, col, rowStart, rowEnd);
  var zipped = _.zip.apply(_, [titles, dataset]);
  var that = this;

  var dataset = {};
  _.forEach(zipped, function(item) {
    var desc = item[0],
      content = item[1];

    if (desc) {
      var buildmElem = that.e57Data2buildm[desc];
      dataset[buildmElem] = (content) ? content.trim() : content;
    }
  });

  return dataset;
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

Converter.prototype.createE57AsJsonLD = function(fileUrl, e57Dataset, paUri, rightsDetails) {
  var e57JsonLD = {},
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

  e57JsonLD['@id'] = uri;
  // e57JsonLD['@type'] = baseUrl + 'DigitalObject';
  e57JsonLD['http://data.duraark.eu/vocab/buildm/represents'] = paUri;
  e57JsonLD['http://data.duraark.eu/vocab/buildm/rightsDetails'] = rightsDetails;

  _.forEach(e57Dataset, function(value, key) {
    if (value) {
      e57JsonLD[baseUrl + key] = value;
    }
  });

  if (rightsDetails.toLowerCase() === 'public') {
    e57JsonLD['http://data.duraark.eu/vocab/buildm/filename'] = fileUrl;
  } else {
    e57JsonLD['http://data.duraark.eu/vocab/buildm/filename'] = 'undisclosed';
  }

  return {
    jsonld: e57JsonLD,
    uri: uri
  }
}

Converter.prototype.jsonld2nquads = function(buildmJSONLD) {
  return jsonld.toRDF(buildmJSONLD, {
    format: 'application/nquads'
  });
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
  var that = this;
  return new Promise(function(resolve, reject) {
    that.jsonld2nquads(jsonld).then(function(ntripleString) {
      try {
        fs.mkdirSync('./output');
      } catch (err) {};

      var outputFile = path.join('./output', uri.split('/').pop() + '.ttl');
      // console.log('Writing file: ' + outputFile);

      try {
        fs.writeFileSync(outputFile, ntripleString);
        resolve(outputFile);
      } catch (err) {
        console.log('Error writing file %s: %s', outputFile, err);
        reject(err);
      }
    }).catch(function(err) {
      console.log(err);
      reject(err);
    });
  });
};

Converter.prototype.insertIntoSDAS = function(rdfFilePath) {
  return new Promise(function(resolve, reject) {
    try {
      var params = '-X POST -d @' + rdfFilePath + ' http://DELETE_IF_SURE_asev.l3s.uni-hannover.de:9986/api/SDO/SDAVer/addTriples';

      console.log('[insertIntoSDAS] about to run: "curl ' + params + '"');

      var executable = spawn('curl', params.split(' '));

      executable.stdout.on('data', function(data) {
        console.log(data.toString());
      });

      executable.stderr.on('data', function(err) {
        console.log(err.toString());
      });

      executable.on('close', function(code) {
        if (code !== 0) { // 'e57metadata' return '1' on success
          console.log('[insertIntoSDAS] ERROR: exited with code:' + code);
          return reject('[insertIntoSDAS] ERROR: exited with code: \n\n' + code + '\n');
        }

        resolve();
      });
    } catch (err) {
      console.log('[insertIntoSDAS] ERROR on program start:\n\n' + err + '\n');
      return reject('[insertIntoSDAS] ERROR on program start:\n\n' + err);
    }
  });
}
