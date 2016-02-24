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

  this.buildmBaseUrl = config.buildmBaseUrl;
}

Converter.prototype.mapCellsToJSON = function(config) {
  var col = XLSX.utils.decode_col(config.col);
  var rowStart = XLSX.utils.decode_row(config.rowStart);
  var rowEnd = XLSX.utils.decode_row(config.rowEnd);
  var titles = this.metadataSheet.getCols(this.sheetName, 0, rowStart, rowEnd);
  var dataset = this.metadataSheet.getCols(this.sheetName, col, rowStart, rowEnd);
  var zipped = _.zip.apply(_, [titles, dataset]);
  var that = this;

  var dataset = {};
  _.forEach(zipped, function(item) {
    var key = item[0],
      value = item[1],
      mappedKey = config.keyMap[key];

    // console.log('key: %s | value: %s | mappedKey: %s', key, value, mappedKey);

    if (mappedKey) {
      dataset[mappedKey] = (value) ? value.trim() : value;
    }

  });

  return dataset;
};

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
    uri = 'http://data.duraark.eu/resource/' + dataset.uri,
    that = this;

  paJsonLD['@id'] = uri;
  paJsonLD['@type'] = this.buildmBaseUrl + 'PhysicalAsset';

  _.forEach(dataset, function(value, name) {
    if (name && value && name != 'uri' && name != 'fileBaseUrl') { // FIXXME: implement a more maintainable filtering!
      paJsonLD[that.buildmBaseUrl + name] = [{
        '@value': value
      }];
    }
  });

  return {
    jsonld: paJsonLD,
    uri: uri
  }
}

Converter.prototype.createE57AsJsonLD = function(filePath, e57Dataset, paUri, rightsDetails, localFileBasePath) {
  var e57JsonLD = {},
    fileType = filePath.split('.').pop(),
    uri,
    that = this;

  if (fileType.toLowerCase() === 'ifc') {
    type = 'ifcspffile';
    uri = 'http://data.duraark.eu/resource/' + type + '_' + md5(filePath);
    e57JsonLD['@type'] = this.buildmBaseUrl + 'IFCSPFFile';
  } else if (fileType.toLowerCase() === 'e57') {
    type = 'e57file';
    uri = 'http://data.duraark.eu/resource/' + type + '_' + md5(filePath);
    e57JsonLD['@type'] = this.buildmBaseUrl + 'E57File';
  }

  e57JsonLD['@id'] = uri;
  e57JsonLD[this.buildmBaseUrl + 'represents'] = {
    '@value': paUri
  };
  e57JsonLD[this.buildmBaseUrl + 'rightsDetails'] = [{
    '@value': rightsDetails
  }];

  _.forEach(e57Dataset, function(value, key) {
    if (value) {
      e57JsonLD[that.buildmBaseUrl + key] = [{
        '@value': value
      }];
    }
  });

  if (rightsDetails.toLowerCase() === 'public') {
    e57JsonLD[this.buildmBaseUrl + 'filename'] = {
      '@value': filePath.replace(localFileBasePath, 'http://duraark.tib.eu')
    };
  } else {
    e57JsonLD[this.buildmBaseUrl + 'filename'] = {
      '@value': filePath.split('/').pop() // NOTE: only preserve the filename, but discard downloadable path!
    };
  }

  return {
    jsonld: e57JsonLD,
    uri: uri,
    url: filePath,
    downloadAllowed: rightsDetails.toLowerCase() === 'public'
  }
}

Converter.prototype.jsonld2nquads = function(buildmJSONLD) {
  return jsonld.toRDF(buildmJSONLD, {
    format: 'application/nquads'
  });
}

Converter.prototype.getDigitalObjectsUrls = function(path) {
  return this.fileList.getFiles(path, '*');
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
        console.log('Error writing RDF file %s: %s', outputFile, err);
        reject(err);
      }
    }).catch(function(err) {
      console.log(err);
      reject(err);
    });
  });
};

Converter.prototype.writeWorkbenchUISessionFile = function(paJsonLD, e57JsonLDs) {
  var physicalAsset = paJsonLD.jsonld,
    sessionName = (physicalAsset[this.buildmBaseUrl + 'name']) ? physicalAsset[this.buildmBaseUrl + 'name'][0]['@value'] : 'No Name',
    address = (physicalAsset[this.buildmBaseUrl + 'streetAddress']) ? physicalAsset[this.buildmBaseUrl + 'streetAddress'][0]['@value'] : '',
    description = (physicalAsset[this.buildmBaseUrl + 'description']) ? physicalAsset[this.buildmBaseUrl + 'description'][0]['@value'] : '',
    sessionTemplate;

  return new Promise(function(resolve, reject) {
    var sessionTemplateJSON = fs.readFileSync(path.join(__dirname, './session-template.json'), 'utf8');
    sessionTemplate = JSON.parse(sessionTemplateJSON);

    try {
      fs.mkdirSync('./output/sessionFiles');
    } catch (err) {};

    var outputFile = path.join('./output/sessionFiles/' + paJsonLD.uri.split('/').pop() + '.json');

    sessionTemplate.label = sessionName;
    sessionTemplate.streetAddress = address;
    sessionTemplate.description = description;

    var pa = {
      label: sessionName,
      buildm: paJsonLD.jsonld,
    }
    sessionTemplate.physicalAssets.push(pa);

    _.forEach(e57JsonLDs, function(e57, idx) {
      var e57JsonLD = e57.jsonld,
        convertedUrl = e57.url; // FIXXME: adapt to file structure on demo server!

      var digObj = {
        label: convertedUrl.split('/').pop(),
        buildm: e57JsonLD,
        path: convertedUrl,
        size: fs.statSync(convertedUrl).size
      }
      sessionTemplate.digitalObjects.push(digObj);

      sessionTemplate.files.push({
        path: convertedUrl,
        type: convertedUrl.split('.').pop(),
        size: digObj.size,
        downloadAllowed: e57.downloadAllowed
      });
    });

    try {
      // console.log('Writing file: ' + outputFile);
      fs.writeFileSync(outputFile, JSON.stringify(sessionTemplate, null, 4));
      resolve(outputFile);
    } catch (err) {
      console.log('Error writing JSONLD file %s: %s', outputFile, err);
      reject(err);
    }
  });
};

Converter.prototype.insertIntoSDAS = function(rdfFilePath) {
  return new Promise(function(resolve, reject) {
    try {
      var params = '-X POST -d @' + rdfFilePath + ' http://asev.l3s.uni-hannover.de:9986/api/SDO/SDAVer/addTriples';

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
