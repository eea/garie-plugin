const fs = require('fs-extra');
const path = require('path');

const utils = require ('.')


describe('utils', () => {
    it('test the helper functions', async () => {
        var pathname = utils.helpers.pathNameFromUrl('http://www.test.com')
        expect(pathname).toEqual('www.test.com');

        var options = {
            app_name : 'test_plugin',
            url : 'http://www.test.com',
            app_root : '/tmp/test_reports',
            fileName : 'test.txt'
        };
        var reportDir = utils.helpers.reportDir(options);
        expect(reportDir).toEqual('/tmp/test_reports/reports/test_plugin/www.test.com');

        fs.ensureDirSync(reportDir);

        var dir_1 = reportDir + "/dir_1";
        fs.ensureDirSync(dir_1);
        fs.writeFileSync(path.join(dir_1, 'test.txt'), "test 1");

        var dir_2 = reportDir + "/dir_2";
        fs.ensureDirSync(dir_2);
        fs.writeFileSync(path.join(dir_2, 'test.txt'), "test 2");

        var dir_3 = reportDir + "/dir_3";
        fs.ensureDirSync(dir_3);
        fs.writeFileSync(path.join(dir_3, 'test.txt'), "test 3");

        var newestDir = utils.helpers.newestDir(options);
        expect(newestDir).toEqual('dir_3');

        var file_options = {
            url : "http://www.test.com",
            fileName : "test.txt",
            reportDir: reportDir
        };
        const file = await utils.helpers.getNewestFile(file_options);
        expect(file.toString()).toEqual('test 3');

    });
});
