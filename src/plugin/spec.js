const { plugin_getData, plugin_getMeasurement } = require('./');

const mock_getData = async (options) => {
    return new Promise(async (resolve, reject) => {

        try {
            resolve({"test_result":1});
        } catch (err) {
            console.log(`Failed to get data for ${url}`, err);
            reject(`Failed to get data for ${url}`);
        }
    });
}


const mock_item = {
    plugin_name : "test_plugin",
    report_folder_name : "test_plugin_results",
    url_settings : {
        url: "http://www.test.com"
    },
    app_root : "/",
    getData : mock_getData
}

const mock_getMeasurement_custom = async (item, data) => {
    const { url } = item.url_settings;
    return new Promise(async (resolve, reject) => {
        try {
            const points = Object.keys(data).reduce((points, key) => {
                points.push({
                    measurement: key,
                    tags: { url },
                    fields: { value: data[key], value2: data[key] * 2 }
                });
                return points;
            }, []);
            resolve(points);
        } catch (err) {
            console.log(`Failed to convert data to measurement for ${url}`, err);
            reject(`Failed to convert data to measurement for ${url}`);
        }
    });
};


describe('plugin', () => {
    describe('plugin_getData', () => {
        it('use a specific getData method to retrieve data for a specific url', async () => {
            const result = await plugin_getData(mock_item);
            expect(result).toEqual({"test_result":1});

        });
    });
    describe('plugin_getMeasurement', () => {
        it('build a simple measurement with the built in method', async () => {
            const result = await plugin_getData(mock_item);
            const measurement = await plugin_getMeasurement(mock_item, result);
            expect(measurement).toEqual([{"fields": {"value": 1}, "measurement": "test_result", "tags": {"url": "http://www.test.com"}}]);
        });
        it('build a measurement with a custom method', async () => {
            const result = await plugin_getData(mock_item);
            mock_item.getMeasurement = mock_getMeasurement_custom;
            const measurement = await plugin_getMeasurement(mock_item, result);
            expect(measurement).toEqual([{"fields": {"value": 1, "value2": 2}, "measurement": "test_result", "tags": {"url": "http://www.test.com"}}]);
        });
    });
});