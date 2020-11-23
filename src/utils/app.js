const express = require('express');
const bodyParser = require('body-parser');
const serveIndex = require('serve-index');
const extend = require('extend');
const { reportDir } = require('./helpers');
const plugin = require('../plugin');
const influx = require('../influx');
const sleep = require('sleep-promise');

const JOB_LIFETIME = 24 * 3600;

const createApp = (settings, influx_obj) => {
  const app = express();
  app.use(bodyParser.json());

  app.use('/reports', express.static('reports'), serveIndex('reports', { icons: true }));

  if (settings.onDemand) {
    const scanQueue = {};

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
        const data = await plugin.plugin_getData(item);
        let measurement = [];
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

    app.get('/health', async (req, res) => {
      try {
        var retries = 0;
        while(true){
          try{
            console.log('Trying to connect to influx');
            await influx.create_db(influx_obj);
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
