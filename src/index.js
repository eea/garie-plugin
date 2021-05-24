const CronJob = require('cron').CronJob;
const extend = require('extend')
const influx = require('./influx')
const { plugin_getData } = require('./plugin')
const { plugin_getMeasurement } = require('./plugin')
const mapAsync = require('./utils/map-async');
const utils = require('./utils');
const { createApp } = require('./utils/app');
const sleep = require('sleep-promise');
let numCPUs = require('os').cpus().length;
const path = require('path');
const { exec } = require('child_process');

// macros for deleting old report files;
// can also be customized if added as fields in config.json;
let max_age_of_report_files = 365;

async function getDataForItem(item, retries){

    const { url } = item.url_settings;

    try{
        const pointStatus = influx.markStatus(url, 0, retries);
        await influx.savePoints(item.influx_obj, [pointStatus], url);
        console.log(`Processing url ${url}.`)
        const data = await plugin_getData(item);
        let isSuccess = true;
        if (data !== null){
            if (data.partial_success == true){
                isSuccess = false;
                delete(data.partial_success)
            }
            const measurement = await plugin_getMeasurement(item, data);
            await influx.saveData(item.influx_obj, url, measurement);
        }
        if (isSuccess){
            const pointSuccess = influx.markSuccess(url);
            const pointStatus = influx.markStatus( url, 1, retries);
            await influx.savePoints(item.influx_obj, [pointSuccess, pointStatus], url);
            console.log(`Url ${url} check was successful.`)
        }
    } catch (err) {
        console.log(`Failed to parse ${url}`, err);
    }
}

Array.prototype.diff = function(a) {
    return this.filter(function(i) {return a.indexOf(i) < 0;});
};

async function getFailedUrls(settings){
    const { influx } = settings;
    const { retryTimeRange } = settings;
    const { urls } = settings;
    return new Promise(async (resolve, reject) => {
        try{
            console.log('Trying to get failed tasks');

            const finishedTasks = await influx.query("select * from success where time > now() - " + retryTimeRange + "m");
            let failedUrls;
            try{
                const finishedUrls = finishedTasks.groupRows[0].rows.map(url => url.url);
                failedUrls = urls.diff(finishedUrls);
            }
            catch(err) {
                failedUrls = urls;
            }
            resolve (failedUrls);
        }
        catch (err){
            reject(err);
        }
    });
}


const getDataForAllUrls = async(options) => {
    let items_to_process = options.items;    
    const all_urls = items_to_process.map(url => url.url_settings.url);
    try{
        const pointStatusLogs = influx.markStatusLogs("START", Date.now());
        const pointUrls = influx.markAllUrls(all_urls.length);
                await influx.savePoints(options.influx, [pointStatusLogs, pointUrls], "START");
    } catch(err) {
        console.log(`Failed to START and add number of all urls ${err}`);
    }

    let retries = 0;
    let skip_retry;
    while (true){
        if (!skip_retry){
            try{
                if (options.prepDataForAllUrls !== undefined){
                    await options.prepDataForAllUrls();
                }
                try{
                    await mapAsync(items_to_process, item => getDataForItem(item, retries), { concurrency: numCPUs });
                    console.log('Finished processed all CRON urls.');
                    if (retries > 0){
                        console.log("Retry: " + retries + "/" + options.retryTimes);
                    }
                } catch (err){
                    console.log(err);
                }
            }
            catch (err){
                console.log(err);
            }
        }

        const options_failed = {
            influx: options.influx,
            retryTimeRange: options.retryTimeRange,
            urls: all_urls
        };

        skip_retry = false;
        if (options.retryTimes === retries){
            console.log('No more retries');
            try{
                const failedUrls = await getFailedUrls(options_failed);
                for (let i = 0; i < failedUrls.length; i++) {
                    const pointStatus = influx.markStatus(failedUrls[i], 2, retries);
                    await influx.savePoints(options.influx, [pointStatus], failedUrls[i]);
                }
            }
            catch(err){
                console.log(`Failed to get and save into influx failed urls. ${err}`);
            }

            const pointLogs = influx.markStatusLogs("FINISHED", Date.now());
            try {
                await influx.savePoints(options.influx, [pointLogs], "FINISHED");
            } catch(err) {
                console.log('Failed to add step FINISH', err);
            }
            break;
        } else {
            retries++;
            if (retries <= 1) {
                const pointStatusLogs = influx.markStatusLogs("WAITING", Date.now());
                try {
                    await influx.savePoints(options.influx, [pointStatusLogs], "WAITING");
                } catch(err) {
                    console.log('Failed to add step WAITING', err);
                }
                
            }
            console.log('Wait for ' + options.retryAfter+ ' minutes, then check for failed tasks');
            await sleep(options.retryAfter * 60000);
            let failedUrls = [];
            try{
                failedUrls = await getFailedUrls(options_failed);
                for (let i = 0; i < failedUrls.length; i++) {
                    const pointStatus = influx.markStatus(failedUrls[i], 2, retries - 1);
                    await influx.savePoints(options.influx, [pointStatus], failedUrls[i]);
                }
            }
            catch(err){
                console.log(`Failed to get and save into influx failed urls. ${err}`);
                const pointStatusLogs = influx.markStatusLogs(`RETRY ${retries}`, Date.now());
                try {
                    await influx.savePoints(options.influx, [pointStatusLogs], `RETRY ${retries}`);
                } catch(err) {
                    console.log(`Couldn't add step 'RETRY ${retries}' into influx.`, err);
                }
                console.log("Retry: " + retries + "/" + options.retryTimes);
                console.log("Failed retrieving failed urls");
                skip_retry = true;
                continue;
            }
            if (failedUrls.length === 0){
                const pointStatusLogsFirst = influx.markStatusLogs(`RETRY ${retries}`, Date.now());
                try {
                    await influx.savePoints(options.influx, [pointStatusLogsFirst], `RETRY ${retries}`);
                } catch(err) {
                    console.log(`Failed to add step 'RETRY ${retries}' into influx.`, err);
                }
                console.log("Retry: " + retries + "/" + options.retryTimes);
                console.log('All tasks were executed successfully');
                const pointStatusLogsSecond = influx.markStatusLogs("FINISHED", Date.now());
                try {
                    await influx.savePoints(options.influx, [pointStatusLogsSecond], "FINISHED");
                } catch(err) {
                    console.log("Couldn't add step 'FINISHED' into influx.", err)
                }
                break;
            } else {
                const pointStatusLogs = influx.markStatusLogs(`RETRY ${retries}`, Date.now());
                try {
                    await influx.savePoints(options.influx, [pointStatusLogs], `RETRY ${retries}`);
                } catch(err) {
                    console.log(`Could not add step 'RETRY ${retries}' into influx.`, err);
                }
                console.log('There are ' + failedUrls.length +' failed tasks:');
                console.log(failedUrls);
                console.log("Retry: " + retries + "/" + options.retryTimes);
                items_to_process = options.items.filter(function(i){return failedUrls.indexOf(i.url_settings.url) > -1})
                continue;
            }
        }
    }
}

// delete specific old files;
function delete_specific_files({type, age}, pathToReports, callback) {
    // WARNING: this find goes through all the files, so it is more expensive;
    exec(`find ${pathToReports} -name "*.${type}" -mindepth 2 -mtime +${age} -delete`, (err, stdout, stderr) => {
        if (err) {
            console.log(`Can't execute command to delete files by type ${type}`, err);
        } else {
            console.log(`Successfully deleted ${type} files older than ${age} days.`);
        }

        if (callback) {
            callback(err);
        }
    });
}


const init = async(options) => {

    return new Promise(async (resolve, reject) => {
        try{
            let settings = {
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

            // delete old report files
            const pathToReports = path.join(settings.app_root, 'reports', settings.report_folder_name);

            const influx_obj = influx.init(settings.db_name)
            let retries = 0;
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

            let items = [];
            for (let i = 0; i <= settings.config.urls.length-1; i++){
                const url_settings = {};
                url_settings.url = settings.config.urls[i].url;
                const { plugins } = settings.config.urls[i];
                if ((plugins !== undefined) && (plugins[options.plugin_name] !== undefined)){
                    extend(url_settings, plugins[options.plugin_name]);
                }
                const tmp_item = {
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

            let getAllDataOptions = {};
            getAllDataOptions.items = items;
            getAllDataOptions.prepDataForAllUrls = settings.prepDataForAllUrls;
            getAllDataOptions.influx = influx_obj;

            const retry = settings.config.plugins[settings.plugin_name].retry;

            getAllDataOptions.retryTimes = 3
            getAllDataOptions.retryAfter = 30;
            getAllDataOptions.retryTimeRange = 360;

            if (retry !== undefined){
                if (retry.times !== undefined){
                    getAllDataOptions.retryTimes = retry.times;
                }
                if (retry.after !== undefined){
                    getAllDataOptions.retryAfter = retry.after;
                }
                if (retry.timeRange !== undefined){
                    getAllDataOptions.retryTimeRange = retry.timeRange;
                }
            }

            if (settings.config.plugins[settings.plugin_name].max_age_of_report_files !== undefined) {
                max_age_of_report_files = settings.config.plugins[settings.plugin_name].max_age_of_report_files;
            }

            try {
                const cron_config = settings.config.plugins[settings.plugin_name].cron
                if (cron_config) {
                    new CronJob(
                        cron_config,
                        async () => {
                            const delete_files_by_type = settings.config.plugins[settings.plugin_name].delete_files_by_type;
                            if (delete_files_by_type !== undefined) {
                                delete_specific_files(delete_files_by_type, pathToReports);
                            }

                            exec(`find ${pathToReports} -mindepth 2 -maxdepth 2 -mtime +${max_age_of_report_files} -type d -exec rm -r {} +`, (err, stdout, stderr) => {
                                if (err) {
                                    console.log("Can't execute command to delete old reports files", err);
                                } else {
                                    console.log(`Successfully deleted report files older than ${max_age_of_report_files} days.`);
                                }
                            });

                            if (settings.config.plugins[settings.plugin_name].maxCpus) {
                                //  Set number of CPUs
                                const maxCpus = settings.config.plugins[settings.plugin_name].maxCpus
                                numCPUs = Math.min(numCPUs, maxCpus)
                            }
                            console.log('Threads used: ' + numCPUs)

                            getDataForAllUrls(getAllDataOptions);
                        },
                        null,
                        true,
                        process.env.TZ,
                        null,
                        true
                    );
                }
                const app = createApp(settings, influx_obj);
                resolve({ app });
            } catch (err){
                console.log("Cron is not configured for plugin", err);
                reject("Cron is not configured for plugin");
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
