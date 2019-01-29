const CronJob = require('cron').CronJob;
const extend = require('extend')
const influx = require('./influx')
const { plugin_getData } = require('./plugin')
const numCPUs = require('os').cpus().length;
const mapAsync = require('./utils/map-async');


async function getDataForItem(item){
console.log('getdataforitem');
console.log(item);
    const { url } = item.url_settings;
    try{
        const data = await plugin_getData(item);
//        const measurement = await plugin_getMeasurement(url, item);
//        await influx.saveData(options.influx_obj, url, data);
    } catch (err) {
        console.log(`Failed to parse ${url}`, err);
    }
}

const getDataForAllUrls = async(options) => {
    try{
        await mapAsync(options, item => getDataForItem(item), { concurrency: numCPUs });
        console.log('Finished processed all CRON urls.');
    } catch (err){
        console.log(err);
    }
}

const init = async(options) => {
    var settings = {
        database:'test',
        config:{
            "cron": "0 */4 * * *",
            "urls": [
                {
                    "url": "https://www.test.com/",
                },
                {
                    "url": "https://www.test.co.uk/",
                }
            ]
        }
    }
    extend(settings, options);
    const influx_obj = influx.init(settings.database)
    await influx.create_db(influx_obj);

    var items = [];
    for (var i = 0; i <= settings.config.urls.length-1; i++){
        const url = settings.config.urls[i];
        var tmp_item = {
            url_settings: url,
            influx_obj: influx_obj,
            getData: settings.getData,
            app_name: settings.app_name,
            app_root: settings.app_root
        }
        items.push(tmp_item)
    }
    try {
        if (settings.config.cron) {
            return new CronJob(
                settings.config.cron,
                async () => {
                    getDataForAllUrls(items);
                },
                null,
                true,
                'Europe/London',
                null,
                true
            );
        }
    } catch (err) {
        console.log(err);
    }

}

module.exports = {
    init
};
