const reportDir = require('../utils/helpers').reportDir;

const plugin_getData = async (item) => {
    return new Promise(async (resolve, reject) => {
        try {
            var options = {
                url_settings : item.url_settings,
                reportDir : reportDir ({ url: item.url_settings.url, report_folder_name: item.report_folder_name, app_root: item.app_root }),
                influx: item.influx_obj
            }

            var data = await item.getData(options);

            resolve(data)
        } catch (err) {
            const { url } = item.url_settings;
            console.log(`Failed to get data for ${url}`, err);
            reject(`Failed to get data for ${url}`);
        }
    });
};

const plugin_getMeasurement = async (item, data) => {
    const { url } = item.url_settings;
    return new Promise(async (resolve, reject) => {
        try {
            if (item.getMeasurement){
                const measurement = await item.getMeasurement(item, data)
                resolve ( measurement );
            }
            else {
                const points = Object.keys(data).reduce((points, key) => {
                    points.push({
                        measurement: key,
                        tags: { url },
                        fields: { value: data[key] }
                    });
                    return points;
                }, []);
                resolve(points);
            }
        } catch (err) {
            console.log(`Failed to convert data to measurement for ${url}`, err);
            reject(`Failed to convert data to measurement for ${url}`);
        }
    });
};

module.exports = {
    plugin_getData,
    plugin_getMeasurement
};
