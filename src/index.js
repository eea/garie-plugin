const CronJob = require('cron').CronJob;
const extend = require('extend')
const influx = require('./influx')
const { plugin_getData } = require('./plugin')

const getDataForAllUrls = async(options) => {
    for (const item of options.urls) {
        const { url } = item;
//console.log(url)
        try {
            const data = await plugin_getData(item, options);
console.log(1);
            await influx.saveData(options.influx_obj, url, data);
        } catch (err) {
//            logger.error(`Failed to parse ${url}`, err);
        }
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
    try {
        if (settings.config.cron) {
            return new CronJob(
                settings.config.cron,
                async () => {
                    getDataForAllUrls({urls:settings.config.urls, influx_obj:influx_obj, getData:settings.getData});
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
