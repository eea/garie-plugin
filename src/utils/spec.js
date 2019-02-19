const fs = require('fs-extra');
const path = require('path');

const utils = require ('.')

const getFile = async (options) => {
    options.fileName = 'test.txt';
    const file = await utils.helpers.getNewestFile(options);
    return file;
}


describe('utils', () => {
    it('test the helper functions', async () => {
        var pathname = utils.helpers.pathNameFromUrl('http://www.test.com')
        expect(pathname).toEqual('www.test.com');

        var options = {
            plugin_name : 'test_plugin',
            report_folder_name: 'test_plugin_reports',
            url : 'http://www.test.com',
            app_root : '/tmp/test_reports',
            fileName : 'test.txt'
        };
        var reportDir = utils.helpers.reportDir(options);
        expect(reportDir).toEqual('/tmp/test_reports/reports/test_plugin_reports/www.test.com');

        fs.ensureDirSync(reportDir);

        options = { script: path.join(__dirname, './test.sh'),
            url: "http://www.test.com",
            reportDir: reportDir,
            params: [ "test_param1" ],
            callback: getFile
            }

        options = { script: path.join(__dirname, './test.sh'),
            url: "http://www.test.com",
            reportDir: reportDir,
            params: [ "test_param1" ],
            callback: getFile
            }

        data = await utils.helpers.executeScript(options);
        expect(data.toString().trim()).toEqual("http://www.test.com test_param1");

        options = { script: path.join(__dirname, './test.sh'),
            url: "http://www.test.com",
            reportDir: reportDir,
            params: [ "test_param2" ],
            callback: getFile
            }

        data = await utils.helpers.executeScript(options);
        expect(data.toString().trim()).toEqual("http://www.test.com test_param2");

    });
});
