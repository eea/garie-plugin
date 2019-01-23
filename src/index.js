const CronJob = require('cron').CronJob;
const extend = require('extend')
const influx = require('./influx')
const getData = require('./plugin')

const getDataForAllUrls = async(options = {urls: urls, influx_obj: influx_obj}) => {
    for (const item of options.urls) {
        const { url } = item;
//console.log(url)
        try {
            const data = await getData(item, {});
//            await saveData(options.influx_obj, url, data);
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
                    getDataForAllUrls({urls:settings.config.urls, influx_obj:influx_obj});
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
