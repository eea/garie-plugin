const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const serveIndex = require('serve-index');
const extend = require('extend');
const { copySync } = require('fs-extra');
const { reportDir, newestDirFull, newestDir } = require('./helpers');
const plugin = require('../plugin');
const nunjucks = require('nunjucks');
const influx = require('../influx');
const sleep = require('sleep-promise');

const JOB_LIFETIME = 24 * 3600;
const TIME_IN_SECONDS = 1000000000;
const TIME_IN_NANOS = 1000000;

const createApp = (settings, influx_obj) => {
  const app = express();
  app.use(bodyParser.json());

  app.use('/reports', express.static('reports'), serveIndex('reports', { icons: true }));
  
  nunjucks.configure(`${__dirname}/views`, {
    autoescape: true,
    express: app,
    watch: true,
  });

  async function getCurrentChecks(waitingTimestamp, startTimestamp) {
    const runningChecks = await influx_obj.query(`select * from status where state=\'1\' or state=\'2\' and time<=${waitingTimestamp} and time>=${startTimestamp}`);
    const failedChecks = await influx_obj.query(`select * from status where state=\'2\' and time<=${waitingTimestamp} and time>=${startTimestamp}`);

    const duration = (waitingTimestamp - startTimestamp) / TIME_IN_SECONDS;
    
    const currentChecks = {
      runningChecks: runningChecks.length,
      failedChecks: failedChecks.length,
      startTime: startTimestamp,
      duration: duration
    }

    return currentChecks;
  }

  async function getCurrentRetries(waitingTimestamp, statusLogsRows) {
    const retries = [];
    if (statusLogsRows.length === 0) {
      return {retries};
    }

    const runningRetries = await influx_obj.query(`select * from status where state=\'1\' or state=\'2\' and time > ${waitingTimestamp}`);
    
    for (let i = 0; i < statusLogsRows.length - 1; i++) {
      if (statusLogsRows[i].step.includes("RETRY")) {
        retries.push({
          duration: (statusLogsRows[i + 1].time.getNanoTime() - statusLogsRows[i].time.getNanoTime()) / TIME_IN_SECONDS,
          success: 0,
          fail : 0
        });
      }
    }
      if (statusLogsRows[statusLogsRows.length - 1].step.includes("RETRY")) {
        retries.push({
          duration: (Date.now() * TIME_IN_NANOS - statusLogsRows[statusLogsRows.length - 1].time.getNanoTime()) / TIME_IN_SECONDS,
          success: 0,
          fail : 0
        })
      }
    
    for (let row of runningRetries) {
      if (row.state == 1) {
        retries[row.retry - 1].success++;
        
      } else if(row.state == 2) {
        retries[row.retry - 1].fail++;
      }
    }

    const currentRetries = {
      retries
    };

    return currentRetries;
  }

  app.get('/status', async (req, res) => {
    const defaultMessage = "Plugin has not started yet."
    const nrUrls = settings.config.urls.length;

    let tablesToShow = {
      first: false,
      retries: false,
      finish: false
    };

    const statusLogsQuery = await influx_obj.query('select last(*) from "status-logs" group by step order by time asc');
    if (statusLogsQuery.length === 0) {
      return res.render('status.html', { defaultMessage });
    }
    statusLogsQuery.sort((a, b) => {
      return a.time > b.time;
    });

    const idx = statusLogsQuery.findIndex(elem => elem.step === "START");
    const statusLogsRows = statusLogsQuery.slice(idx);
    const startTimestamp = statusLogsRows[0].time.getNanoTime();
    const startTime = statusLogsRows[0].time.toISOString();

    let waitingTimestamp = Date.now() * TIME_IN_NANOS;
    if (statusLogsRows.length >= 2) {
      waitingTimestamp = statusLogsRows[1].time.getNanoTime();
    }

    const currentlyRunningChecksTable = await getCurrentChecks(waitingTimestamp, startTimestamp);
    const currentlyRunningRetriesTable = await getCurrentRetries(waitingTimestamp, statusLogsRows.slice(2));

    if (statusLogsRows[statusLogsRows.length - 1].step === "START" ||
        statusLogsRows[statusLogsRows.length - 1].step === "WAITING") {

      tablesToShow.first = true;
      return res.render('status.html', { nrUrls, currentlyRunningChecksTable, tablesToShow });
    
    } else if (statusLogsRows[statusLogsRows.length - 1].step.includes("RETRY")) {
    
      tablesToShow.first = true;
      tablesToShow.retries = true;
      return res.render('status.html', { nrUrls, currentlyRunningChecksTable, currentlyRunningRetriesTable, tablesToShow });

    } else if (statusLogsRows[statusLogsRows.length - 1].step === "FINISHED") {
     
      const finishTime = statusLogsRows[statusLogsRows.length - 1].time.getNanoTime();
      const totalRunningTime = (finishTime - startTimestamp) / TIME_IN_SECONDS;
      const successful = await influx_obj.query(`select * from success where time>=${startTimestamp}`);      
      const countSuccess = successful.length;


      tablesToShow.first = true;
      tablesToShow.retries = true;
      tablesToShow.finish = true;
      return res.render('status.html', { nrUrls, currentlyRunningChecksTable, currentlyRunningRetriesTable,
        startTime, totalRunningTime, countSuccess, tablesToShow });
     
    }
    return res.render('status.html', { defaultMessage });
  });
  

    if (settings.onDemand) {
    const scanQueue = {};
    let data = {};
    let measurement = [];

    const launchScanOnDemand = async (url, scan) => {
      try {
        const url_settings = { url };

        const url_config = settings.config.urls.find((c) => c.url === url || c.url === `${url}/`)
        // url_config being truthy means it has found the URL in the config
        if (url_config && url_config.plugins) {
          extend(url_settings, url_config.plugins[settings.plugin_name])
        }

        const report_folder_name = `on-demand/${settings.report_folder_name}`;
        const { app_root, getData, getMeasurement } = settings;
        const item = {
          url_settings,
          report_folder_name,
          app_root,
          influx_obj,
          getData,
          getMeasurement,
        };
        console.log(`Launching scan on demand for ${url}`);

        const data = await plugin.plugin_getData(item);
        var isSuccess = true;
        let measurement = [];

        if (data !== null) {
          if (data.partial_success == true) {
            isSuccess = false;
            delete(data.partial_success)
          }
          measurement = await plugin.plugin_getMeasurement(item, data);
        }
        console.log(`Scan on demand finished for ${url}`);
        scan.result = measurement;
        scan.state = 'success';
        // If URL was in plugin's config, write data to influx and to report dir.
        if (url_config) {
          console.log(`Saving ondemand results for ${url} as permanent.`)
          await influx.saveData(influx_obj, url, measurement);
          if (isSuccess){
            await influx.markSuccess(influx_obj, url);
          }
          // After plugin-specific files have been written to ondemand report dir, copy them to actual reports dir
          const ondemand_options = {
            report_folder_name,
            url,
            app_root,
          };
          ondemand_newest_dir = newestDir(ondemand_options);
          ondemand_dir = newestDirFull(ondemand_options);
          const reports_options = {
            'report_folder_name': settings.report_folder_name,
            'url': url,
            'app_root': app_root,
          };
          reports_dir = reportDir(reports_options);
          reports_dir_now = path.join(reports_dir, ondemand_newest_dir);
          console.log(`Copying from ${ondemand_dir} to ${reports_dir_now}.`);
          try {
            copySync(ondemand_dir, reports_dir_now);
            console.log('Successfully copied reports to permanent dir.');
          } catch (err) {
            console.error(err);
          }
        }

      } catch(err) {
        console.log(`Scan on demand failed for ${url}`);
        console.error(err);
        scan.state = 'error';
      }
    }

    const removeOldScans = () => {
      const now = new Date().getTime();
      for (const id of Object.keys(scanQueue)) {
        if (now - id > JOB_LIFETIME * 1000) {
          delete scanQueue[id];
        }
      }
    }

    const scanOnDemand = (url) => {
      removeOldScans();
      const scan = {
        id: new Date().getTime(),
        state: 'inprogress',
      };
      scanQueue[scan.id] = scan;
      launchScanOnDemand(url, scan);
      return scan;
    }

    app.post('/scan', async (req, res) => {
      res.send(scanOnDemand(req.body.url));
    });

    app.get('/scan/:id', (req, res) => {
      res.send(scanQueue[req.params.id]);
    });

    app.get('/health', async (req, res) => {
      try {
        var retries = 0;
        while(true){
          try{
            await influx.list_db(influx_obj);
            break;
          }
          catch (err){
            retries++;
              if (retries < 3){
                console.log('Failed to connect to influx, retry #', retries);
                await sleep(1000);
              }
              else {
                throw(err);
              }
          }
        }
        res.sendStatus(200);
      } catch(err) {
        console.log('Healthcheck: failed connecting to influx');
        console.error(err);
        res.sendStatus(400);
      }
    });
  }

  return app;
};

module.exports = {
  createApp,
}
