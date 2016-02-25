var XLSX = require('xlsx'),
  _ = require('underscore');

var Workbook = module.exports = function(path) {
  this._workbook = null;
  this._workbookPath = path;
  this._postProcessors = [];

  this._load(this._workbookPath);
}

Workbook.prototype.reset = function(all) {
  this._workbook = null;

  if (all) {
    this._workbookPath = this._config.path;
    this._postProcessors = [];
  }
};

Workbook.prototype.filterBy = function(sheetName, col, filterTerms) {
  var json = this.getWorksheet({
    sheetName: sheetName,
    outFormat: 'json'
  });

  var selectedRows = [];

  // Check if 'filterTerms' is an Array. Solution is taken from:
  // http://perfectionkills.com/instanceof-considered-harmful-or-how-to-write-a-robust-isarray/
  if (Object.prototype.toString.call(filterTerms) !== '[object Array]') {
    filterTerms = [filterTerms];
  }
  // console.log('rows: ' + JSON.stringify(rows, null, 4));
  // console.log('rows: ' + rows.length);

  var k = XLSX.utils.decode_col(col);
  json.forEach(function(row, idx) {
    //var row = row.split(',');
    // console.log('row: ' + JSON.stringify(row));
    // console.log('rowk: ' + row[k] + ' / filterTerms: ' + filterTerms);
    for (var idx = 0; idx < filterTerms.length; idx++) {
      var term = filterTerms[idx];

      if (row[k] === term) {
        selectedRows.push(row);
        break;
      }
    }
  });

  // console.log('result: ' + JSON.stringify(selected_rows));
  // console.log('result: ' + selected_rows.length);

  return selectedRows;
};

Workbook.prototype.getRows = function(sheetName, start_row, end_row) {
  var json = this.getWorksheet({
    sheetName: sheetName,
    outFormat: 'json'
  });

  var selectedRows = [];

  json.forEach(function(row, idx) {
    if (idx >= start_row && idx <= end_row) {
      selectedRows.push(row);
    }
  });

  // console.log('result: ' + JSON.stringify(selected_rows));
  // console.log('result: ' + selected_rows.length);

  return selectedRows;
};

Workbook.prototype.getCols = function(sheetName, col, start_row, end_row) {
  var json = this.getWorksheet({
    sheetName: sheetName,
    outFormat: 'json'
  });

  var selectedCols = [];

  json.forEach(function(row, idx) {
    if (idx >= start_row && idx <= end_row) {
      selectedCols.push(row[col]);
    }
  });

  // console.log('result: ' + JSON.stringify(selected_rows));
  // console.log('result: ' + selected_rows.length);

  return selectedCols;
};

Workbook.prototype.getCell = function(sheetName, colStr, rowStr) {
  var col = XLSX.utils.decode_col(colStr);
  var row = XLSX.utils.decode_row(rowStr);

  var json = this.getWorksheet({
    sheetName: sheetName,
    outFormat: 'json'
  });

  return json[row][col];
}

Workbook.prototype.sliceRows = function(rows, rangestr) {
  var range = XLSX.utils.decode_range(rangestr);
  // console.log('range: ' + JSON.stringify(range));

  var result = [];

  rows.forEach(function(row, idx) {
    // console.log('bla: ' + JSON.stringify(row));
    var rowSliced = row.slice(range.s.c, range.e.c + 1);
    result.push(rowSliced);
    // console.log('bla: ' + JSON.stringify(rowSliced));
  });

  return result;
};

Workbook.prototype.getWorksheet = function(opts) {
  var worksheet = this._workbook.Sheets[opts.sheetName],
    selected_rows = [];

  // TODO: incorporate 'opts.outFormat'!

  // var rows = XLSX.utils.sheet_to_row_object_array(worksheet, {
  var json = XLSX.utils.sheet_to_json(worksheet, opts.opts || {
    // range: 'A0:A10',
    // raw: true,
    header: 1 // Setting header > 0 does not cut of an eventual header (not very intuitive...). This
      // is necessary for 'shtte_to_json' to work correctly!
  });

  return json;
}

Workbook.prototype._load = function(path) {
  console.log('Loading file: ' + path);

  this._workbook = XLSX.readFile(path, {
    encoding: 'utf8'
  });

  console.log('        ... done');
};

Workbook.prototype.saveAsFile = function(filename) {
  XLSX.writeFile(this._workbook, filename);
};

Workbook.prototype.mapCellsToJSON = function(config) {
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
