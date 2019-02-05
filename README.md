Generic garie plugin package

Usage:
Create a github repo for your plugin, for the tutorial we will call it: "my-garie-plugin"
Add a Dockerfile:
```
FROM node:8.10.0

RUN mkdir -p /usr/src/my-garie-plugin
RUN mkdir -p /usr/src/my-garie-plugin/reports

WORKDIR /usr/src/my-garie-plugin

COPY package.json .

RUN cd /usr/src/my-garie-plugin && npm install

COPY . .

EXPOSE 3000

VOLUME ["/usr/src/my-garie-plugin/reports"]

ENTRYPOINT ["/usr/src/my-garie-plugin/docker-entrypoint.sh"]

CMD ["npm", "start"]
```
Add the docker-entrypoint.sh. This is required so we can pass the config.json as an env from docker-compose or rancher:
```
#!/bin/sh
set -e

if [ -n "$CONFIG" ]; then
    echo "Found configuration variable, will write it to the /usr/src/garie-ssslabs/config.json"
    echo "$CONFIG" > /usr/src/garie-linksintegrity/config.json
fi

exec "$@"
```
Add your config.json (for development, and as an example, what extra parameters are required for each url)
```
{
  "cron": "0 */4 * * *",
  "urls": [
    {
      "url": "https://www.eea.europa.eu/",
      "recursion_depth": "1"
    },
    {
      "url": "https://www.test.com/",
      "recursion_depth": "1"
    }
  ]
}
```
Add a jest.config.json (for testing)
```
{
    "bail": true,
    "verbose": true,
    "coveragePathIgnorePatterns": ["/node_modules/"]
}
```
Add a folder, called src, and create an index.js file in it:
```
const garie_plugin = require('garie-plugin')
const path = require('path');
const config = require('./config');

const myGetData = async (options) => {
    const { url } = options.url_settings;
    return new Promise(async (resolve, reject) => {
// custom code for getting the data for a url
    });
};

const mock_getMeasurement_custom = async (item, data) => {
// custom code to build a measurement for the url
};
var plugin_options = {
    getData: myGetData,
    getMeasurement: myGetMeasurement, //optional
    app_name: 'my_plugin',
    app_root: app_root: path.join(__dirname, '..'),
    config: config
};
```
In some cases, the data for an url is retrieved with an app running inside a docker container. For this we use a shell script, something like:
```
#!/usr/bin/env bash
echo "Start getting data"

echo "Getting data for: $1"

echo "Recursion depth: $3"

report_location=$2/$(date +"%FT%H%M%S+0000")

mkdir -p $report_location

docker run --rm linkchecker/linkchecker $1 $3 --no-robots > $report_location/linksintegrity.txt 2>&1

echo "Finished getting data for: $1"

exit 0
```
So your directory should look like:
<pre>
    └── my-garie-plugin
        ├── Dockerfile
        ├── config.json
        ├── docker-compose.yml
        ├── docker-entrypoint.sh
        ├── jest.config.json
        ├── package.json
        └── src
              ├── index.js
              └── myscript.sh
</pre>