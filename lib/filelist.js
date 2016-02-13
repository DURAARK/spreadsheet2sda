var glob = require('glob'),
  Promise = require('bluebird');

var FileList = module.exports = function() {}

FileList.prototype.getFiles = function(path, globExp) {
  return new Promise(function(resolve, reject) {
    glob(path + globExp, function(err, files) {
      if (err) {
        return reject(err);
      }

      resolve(files);
    });
  });
}
