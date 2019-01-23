
const getData = async (item, options) => {
//console.log(2)
    return new Promise(async (resolve, reject) => {
//console.log(3)
//        var { url } = item;
//console.log(4)
//        var data = await options.getData(url, options);
//    resolve(data)

        try {
                resolve(1);
        } catch (err) {
            logger.warn(`Failed to get data for ${url}`, err);
            reject(`Failed to get data for ${url}`);
        }

    });
};

module.exports = {
    getData
};
