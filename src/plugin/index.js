const plugin_getData = async (item, options) => {
    return new Promise(async (resolve, reject) => {
        try {
            var data = await options.getData(item, {});
            resolve(data)
        } catch (err) {
            logger.warn(`Failed to get data for ${url}`, err);
            reject(`Failed to get data for ${url}`);
        }
    });
};

const plugin_getMeasurement = async (item, options) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (options.getMeasurement){
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
            }
        } catch (err) {
            logger.warn(`Failed to convert data to measurement for ${url}`, err);
            reject(`Failed to convert data to measurement for ${url}`);
        }
    });
};

module.exports = {
    plugin_getData
};
