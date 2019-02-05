const garie_plugin = require('garie-plugin')
const path = require('path');
const config = require('../config');

const myGetMeasurement = async (options) => {
// custom code to build a measurement for the url
};

}
const myGetData = async (options) => {
    const { url } = options.url_settings;
    return new Promise(async (resolve, reject) => {
        try {
// my code to get the data for a url
            resolve(data);
        } catch (err) {
            console.log(`Failed to get data for ${url}`, err);
            reject(`Failed to get data for ${url}`);
        }
    });
};


garie_plugin.init({getData:myGetData, getMeasurement: myGetMeasurement, app_name:'<my_garie_plugin>', app_root: path.join(__dirname, '..'), config:config});
