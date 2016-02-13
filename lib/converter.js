var Workbook = require('./workbook'),
  _ = require('underscore'),
  XLSX = require('xlsx'),
  jsonld = require('jsonld').promises,
  uuid = require('node-uuid');

var Converter = module.exports = function(config) {
  this.desc2buildm = config.desc2buildm;

  metadataSheet = new Workbook(config.metadataFilePath);
}

Converter.prototype.dataset2JSONLD = function(dataset) {
  var buildmJSONLD = {},
    type = 'physical_asset',
    baseUrl = 'http://data.duraark.eu/vocab/buildm/',
    uri = 'http://data.duraark.eu/' + type + '_' + dataset.uri;

  buildmJSONLD['@id'] = uri;
  buildmJSONLD['@type'] = baseUrl + 'PhysicalAsset';

  _.forEach(dataset, function(value, name) {
    if (name && value && name != 'uri') {
      buildmJSONLD[baseUrl + name] = {
        '@value': value
          // '@type': item.type
      }
    }
  });

  return {
    jsonld: buildmJSONLD,
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
  var dataset1 = metadataSheet.getCols(sheetName, col, rowStart, rowEnd);
  var zipped = _.zip.apply(_, [titles, dataset1]);
  var that = this;

  var dataset = {};
  _.forEach(zipped, function(item) {
    var desc = item[0],
      content = item[1],
      buildmElem = that.desc2buildm[desc];

    dataset[buildmElem] = (content) ? content.trim() : content;
  });

  return dataset;
}
