const CronJob = require('cron').CronJob;
const extend = require('extend')
const influx = require('./influx')
const { plugin_getData } = require('./plugin')
const { plugin_getMeasurement } = require('./plugin')
const numCPUs = require('os').cpus().length;
const mapAsync = require('./utils/map-async');
const utils = require('./utils');
const sleep = require('sleep-promise');

async function getDataForItem(item){

    const { url } = item.url_settings;
    try{
        const data = await plugin_getData(item);
        const measurement = await plugin_getMeasurement(item, data);
        await influx.saveData(item.influx_obj, url, measurement);
    } catch (err) {
        console.log(`Failed to parse ${url}`, err);
    }
}

const getDataForAllUrls = async(options) => {
    if (options.prepDataForAllUrls !== undefined){
        await options.prepDataForAllUrls();
    }
    try{
        await mapAsync(options.items, item => getDataForItem(item), { concurrency: numCPUs });
        console.log('Finished processed all CRON urls.');
    } catch (err){
        console.log(err);
    }
}

const init = async(options) => {
    return new Promise(async (resolve, reject) => {
        try{
            var settings = {
                db_name:'test',
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
            const influx_obj = influx.init(settings.db_name)

            var retries = 0;
            var shouldInterrupt = false;
            while(true){
                try{
                    console.log('Trying to connect to influx');
                    await influx.create_db(influx_obj);
                    console.log('Connected to influx');
                    break;
                }
                catch (err){
                    retries++;
                    if (retries < 60){
                        console.log('Failed to connect to influx, retry #', retries);
                        await sleep(1000)
                    }
                    else {
                        throw(err);
                    }
                }
            }

            var items = [];
            for (var i = 0; i <= settings.config.urls.length-1; i++){
                const url_settings = {};
                url_settings.url = settings.config.urls[i].url;
                const { plugins } = settings.config.urls[i];
                if ((plugins !== undefined) && (plugins[options.plugin_name] !== undefined)){
                    extend(url_settings, plugins[options.plugin_name]);
                }
                var tmp_item = {
                    url_settings: url_settings,
                    influx_obj: influx_obj,
                    getData: settings.getData,
                    getMeasurement: settings.getMeasurement,
                    plugin_name: settings.plugin_name,
                    report_folder_name: settings.report_folder_name,
                    app_root: settings.app_root
                }
                items.push(tmp_item)
            }

            var getAllDataOptions = {};
            getAllDataOptions.items = items;
            getAllDataOptions.prepDataForAllUrls = settings.prepDataForAllUrls;
            try {
                const cron_config = settings.config.plugins[settings.plugin_name].cron
                if (cron_config) {
                    return new CronJob(
                        cron_config,
                        async () => {
                            getDataForAllUrls(getAllDataOptions);
                        },
                        null,
                        true,
                        'Europe/London',
                        null,
                        true
                    );
                }
            } catch (err){
                console.log("Cron is not configured for plugin", err);
            }
        } catch (err){
            console.log(err);
            reject(err);
        }
    });
}

module.exports = {
    init,
    utils
};
