const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const serveIndex = require('serve-index');
const extend = require('extend');
const { copySync } = require('fs-extra');
const { reportDir, newestDirFull, newestDir } = require('./helpers');
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
