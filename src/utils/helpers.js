const path = require('path');
const urlParser = require('url');
const isEmpty = require('lodash.isempty');

function pathNameFromUrl(url) {
  const parsedUrl = urlParser.parse(url),
    pathSegments = parsedUrl.pathname.split('/');

  pathSegments.unshift(parsedUrl.hostname);

  if (!isEmpty(parsedUrl.search)) {
    const md5 = crypto.createHash('md5'),
      hash = md5
        .update(parsedUrl.search)
        .digest('hex')
        .substring(0, 8);
    pathSegments.push('query-' + hash);
  }
  return pathSegments.filter(Boolean).join('-');
}

function reportDir(options) {
    const { app_name } = options;
    const { url } = options;

    return path.join(options.app_root, 'reports', app_name, pathNameFromUrl(url));
}

function newestDir(options) {
    const { app_name } = options;
    const { url } = options;

    const dir = path.join(options.app_root, 'reports', app_name, pathNameFromUrl(url));

    const folders = fs.readdirSync(dir);

    const newestFolder = folders[folders.length - 1];

    return newestFolder;
}

module.exports = {
    reportDir,
    newestDir
}
