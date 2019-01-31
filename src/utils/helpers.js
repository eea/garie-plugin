const fs = require('fs');
const path = require('path');
const urlParser = require('url');
const isEmpty = require('lodash.isempty');
const child_process = require('child_process');


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

const executeScript = async (options) => {
    const { url } = options;
    return new Promise(async (resolve, reject) => {
        try {

            const { script } = options;
            const { reportDir } = options;
            const { params } = options;
            const { callback } = options;

            const command = [ script, url, reportDir ].concat(params);

            const child = child_process.spawn('bash', command);

            child.on('exit', async () => {
                const data = await options.callback({url: url, reportDir: reportDir});
                resolve(data);
            });

            child.stdout.pipe(process.stdout);
            child.stderr.pipe(process.stderr);
        } catch (err) {
            console.log(`Failed to get data for ${url}`, err);
            reject(`Failed to get data for ${url}`);
        }
    });
}

const getNewestFile = (options) => {
    try {
        const { url } = options;
        const { fileName } = options;
        const { reportDir } = options;

        const folders = fs.readdirSync(reportDir);

        const newestFolder = folders[folders.length - 1];

        const newestFile = fs.readFileSync(path.join(reportDir, newestFolder, fileName));

        return Promise.resolve(newestFile);
    } catch (err) {
        console.log(err);
        const message = `Failed to get linksintegrity file for ${url}`;
        logger.warn(message);
        return Promise.reject(message);
    }
};


module.exports = {
    reportDir,
    newestDir,
    executeScript,
    getNewestFile
}
