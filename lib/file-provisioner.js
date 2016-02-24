var path = require('path'),
  Promise = require('bluebird'),
  promisify = require('promisify-node'),
  fs = promisify('fs-extra'),
  FileList = require('./filelist'),
  spawn = require('child_process').spawn,
  util = require('util');

var FileProvisioner = module.exports = function(config) {
  this.fileList = new FileList();
  this.dryRun = config.dryRun || false;
}

FileProvisioner.prototype.provisionFiles = function(config) {
  var rootPaths = config.spreadsheet.mapCellsToJSON({
      col: config.col,
      rowStart: config.rowStart,
      rowEnd: config.rowEnd,
      keyMap: config.keyMap
    }),
    that = this;

  var e57nSrcPath = rootPaths.e57nRootPath.replace('/data', '/tmp/duraark-data/data'),
    e57nGlob = '*.e57n',
    e57nDestPath = rootPaths.destinationRootPath,
    ifcSrcPath = rootPaths.ifcRootPath.replace('/data', '/tmp/duraark-data/data'),
    ifcGlob = '*.ifc',
    ifcDestPath = rootPaths.destinationRootPath;

  return this.createFolderStructure(rootPaths.destinationRootPath)
    .then(that.copyFiles(e57nSrcPath, e57nGlob, e57nDestPath))
    .then(that.copyFiles(ifcSrcPath, ifcGlob, ifcDestPath))
    .then(function() {

      return {
        srcPath: rootPaths.e57nRootPath.replace('/data', '/tmp/duraark-data/data'),
        srcGlob: '*.e57n',
        destPath: rootPaths.destinationRootPath
      };
    });
}

FileProvisioner.prototype.copyFiles = function(srcPath, srcGlob, destPath) {
  console.log('[FileProvisioner] copying %s to %s', path.join(srcPath, srcGlob), destPath);

  if (this.dryRun) {
    console.log('[FileProvisioner] FINISHED DRY RUN copying %s to %s', path.join(srcPath, srcGlob), destPath);
    return true;
  } else {
    return fs.copy(srcPath, destPath, srcGlob).then(function() {
      console.log('[FileProvisioner] FINISHED copying %s to %s', path.join(srcPath, srcGlob), destPath);
      return true;
    });
  }
}

FileProvisioner.prototype.createFolderStructure = function(rootPath) {
  var promises = [];

  promises.push(fs.mkdirp(path.join(rootPath, 'master')));
  promises.push(fs.mkdirp(path.join(rootPath, 'derivative_copy')));
  promises.push(fs.mkdirp(path.join(rootPath, 'tmp')));

  return Promise.all(promises);
}
