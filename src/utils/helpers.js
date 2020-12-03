const fs = require('fs');
const path = require('path');
const urlParser = require('url');
const isEmpty = require('lodash.isempty');
const child_process = require('child_process');
const dateFormat = require('dateformat');
const crypto = require('crypto');

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
    const { report_folder_name } = options;
    const { url } = options;
    const { app_root } = options;

    return path.join(app_root, 'reports', report_folder_name, pathNameFromUrl(url));
}

function reportDirNow(reportDir) {
    date = new Date();

    return path.join(reportDir, dateFormat(date, "isoUtcDateTime"));
}

function newestDirBase(options) {
    const { report_folder_name } = options;
    const { url } = options;
    const { app_root } = options;

    const dir = path.join(app_root, 'reports', report_folder_name, pathNameFromUrl(url));

    let folders = fs.readdirSync(dir);

    // Filter out accidental non-date folders before finding newest
    folders = folders.filter(folder => !isNaN(Date.parse(folder)))
    const newestFolder = folders[folders.length - 1];

    return { dir, newestFolder };
}

function newestDir(options) {
    dirObject = newestDirBase(options);
    const { newestFolder } = dirObject;

    return newestFolder;
}

function newestDirFull(options) {
    dirObject = newestDirBase(options);
    const { dir } = dirObject;
    const { newestFolder } = dirObject;

    return path.join(dir, newestFolder);
}

const executeScript = async (options) => {
    const { url } = options;
    return new Promise(async (resolve, reject) => {
        try {
            const { script } = options;
            const { reportDir } = options;
            const { params } = options;
            const { callback } = options;
            const { timeout = 0 } = options;

            const command = [ script, url, reportDir ].concat(params);

            const child = child_process.spawn('bash', command);

            child.on('exit', async (code) => {
                console.log("Exit code from script:", code);
                if ((code !== null) && (code !== 124)){
                    try{
                        const data = await callback({url: url, reportDir: reportDir});
                        resolve(data);
                    }
                    catch(err){
                        reject(`Failed to get file`);
                    }
                }
                else {
                    console.log(`Timeout while trying to get data for ${url}`);
                    reject(`Timeout while trying to get data for ${url}`);
                }
            });
            if (timeout > 0){
                setTimeout(function(){
                        child.kill(9);
                    }, timeout * 1000);
            }
            child.stdout.pipe(process.stdout);
            child.stderr.pipe(process.stderr);
        } catch (err) {
            console.log(`Failed to get data for ${url}`, err);
            reject(`Failed to get data for ${url}`);
        }
    });
}

const getNewestFile = (options) => {
    const { url } = options;
    try {
        const { fileName } = options;
        const { reportDir } = options;

        let folders = fs.readdirSync(reportDir);

        // Filter out accidental non-date folders before finding newest
        folders = folders.filter(folder => !isNaN(Date.parse(folder.slice(0,10))));
        const newestFolder = folders[folders.length - 1];

        const newestFile = fs.readFileSync(path.join(reportDir, newestFolder, fileName));

        return Promise.resolve(newestFile);
    } catch (err) {
        console.log(err);
        const message = `Failed to get file for ${url}`;
        return Promise.reject(message);
    }
};


module.exports = {
    reportDir,
    reportDirNow,
    newestDir,
    newestDirFull,
    executeScript,
    getNewestFile,
    pathNameFromUrl
}
