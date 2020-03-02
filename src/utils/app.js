const express = require('express');
const bodyParser = require('body-parser');
const serveIndex = require('serve-index');
const { reportDir } = require('./helpers');

const createApp = (settings) => {
  const app = express();
  app.use(bodyParser.json());

  app.use('/reports', express.static('reports'), serveIndex('reports', { icons: true }));

  if (settings.onDemand) {
    const scanQueue = {};

    const launchScanOnDemand = async (url, scan) => {
      try {
        console.log(`Launching scan on demand for ${url}`);
        const data = await settings.getData({
          url_settings: { url },
          reportDir: reportDir({
            url,
            report_folder_name: `on-demand/${settings.report_folder_name}`,
            app_root: settings.app_root,
          }),
        });
        console.log(`Scan on demand finished for ${url}`);
        scan.result = data;
        scan.state = 'success';
      } catch(err) {
        console.log(`Scan on demand failed for ${url}`);
        console.error(err);
        scan.state = 'error';
      }
    }

    const scanOnDemand = (url) => {
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
