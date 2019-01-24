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

module.exports = {
    plugin_getData
};
