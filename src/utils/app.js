const express = require('express');
const bodyParser = require('body-parser');
const serveIndex = require('serve-index');
const extend = require('extend')
const { reportDir } = require('./helpers');
const plugin = require('../plugin');
const nunjucks = require('nunjucks');
const sleep = require('sleep-promise');


const JOB_LIFETIME = 24 * 3600;

const createApp = (settings, influx_obj) => {
  const app = express();
  app.use(bodyParser.json());

  app.use('/reports', express.static('reports'), serveIndex('reports', { icons: true }));
  
  const nunjucksEnv = nunjucks.configure(`${__dirname}/views`, {
    autoescape: true,
    express: app,
    watch: true,
  });
  
  nunjucksEnv.addGlobal('settings', settings)

  async function getCurrentChecks(waitingStateTimestamp, startTimestamp) {
    const runningChecks = await influx_obj.query(`select * from status where state=\'1\' or state=\'2\' and time<=${waitingStateTimestamp} and time>=${startTimestamp}`);
    const failedChecks = await influx_obj.query(`select * from status where state=\'2\' and time<=${waitingStateTimestamp} and time>=${startTimestamp}`);

    const duration = (waitingStateTimestamp - startTimestamp) / 1000000000;
    
    const currentChecks = {
      runningChecks: runningChecks.length,
      failedChecks: failedChecks.length,
      startTime: startTimestamp,
      duration: duration
    }

    return currentChecks;
  }


  async function getCurrentRetries(waitingStateTimestamp, statusLogsRows) {

    const retries = [];
    if (statusLogsRows.length === 0) {
      return {retries};
    }

    const runningRetries = await influx_obj.query(`select * from status where state=\'1\' or state=\'2\' and time > ${waitingStateTimestamp}`);
    
    for (let i = 0; i < statusLogsRows.length - 1; i++) {
      if (statusLogsRows[i].step.includes("RETRY")) {
        retries.push({
          duration: (statusLogsRows[i + 1].time.getNanoTime() - statusLogsRows[i].time.getNanoTime()) / 1000000000,
          success: 0,
          fail : 0
        });
      }
    }
      if (statusLogsRows[statusLogsRows.length - 1].step.includes("RETRY")) {
        retries.push({
          duration: (Date.now() * 1000000 - statusLogsRows[statusLogsRows.length - 1].time.getNanoTime()) / 1000000000,
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

    let tablesToShow = {first: false, retries: false, finish: false};

    const statusLogsQuery = await influx_obj.query('select last(*) from "status-logs" group by step order by time asc');
    if (statusLogsQuery.length === 0) {
      return res.render('status.html', { defaultMessage });
    }
    statusLogsQuery.sort((a, b) => {
      return a.time > b.time;
    });

    let idx = statusLogsQuery.findIndex(elem => elem.step === "START");
    const statusLogsRows= statusLogsQuery.slice(idx);
    const startTimestamp = statusLogsRows[0].time.getNanoTime();
    const startTime = statusLogsRows[0].time.toISOString();

    let waitingTimestamp = Date.now() * 1000000;
    if (statusLogsRows.length >= 1) {
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
      const totalRunningTime = (finishTime - startTimestamp) / 1000000000;
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
        data = await plugin.plugin_getData(item);
        measurement = [];
        if (data !== null) {
          measurement = await plugin.plugin_getMeasurement(item, data);
        }
        console.log(`Scan on demand finished for ${url}`);
        scan.result = measurement;
        scan.state = 'success';
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
  }

  return app;
};

module.exports = {
  createApp,
}
