

# Generic garie plugin package

## Setting up the repo:
Create a github repo for your plugin, for the tutorial we will call it: "my-garie-plugin"
### Add a Dockerfile:
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

### Add the docker-entrypoint.sh. This is required so we can pass the config.json as an env from docker-compose or rancher:
```
#!/bin/sh
set -e

if [ -n "$CONFIG" ]; then
    echo "Found configuration variable, will write it to the /usr/src/garie-ssslabs/config.json"
    echo "$CONFIG" > /usr/src/garie-linksintegrity/config.json
fi

exec "$@"
```

### Add your config.json (for development, and as an example, what extra parameters are required for each url)
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

### Add a jest.config.json (for testing)
```
{
    "bail": true,
    "verbose": true,
    "coveragePathIgnorePatterns": ["/node_modules/"]
}
```

### Add a folder, called src, and create an index.js file in it:
```
const garie_plugin = require('garie-plugin')
const path = require('path');
const config = require('./config');

const myGetData = async (options) => {
    const { url } = options.url_settings;
	return new Promise(async (resolve, reject) => {
	    try {
// custom code to query for a specific url			
            resolve(data);
        } catch (err) {
            console.log(`Failed to get data for ${url}`, err);
            reject(`Failed to get data for ${url}`);
        }
    });
};

const myGetMeasurement = async (item, data) => {
// custom code to build a measurement for the url
};

var plugin_options = {
    getData: myGetData,
    getMeasurement: myGetMeasurement, //optional
    app_name: 'my_plugin',
    app_root: app_root: path.join(__dirname, '..'),
    config: config
};

garie_plugin.init(plugin_options)
```

### In some cases, the data for an url is retrieved with an app running inside a docker container. For this we use a shell script, something like:
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

### At this point your directory should look like:
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

## Helper functions
Some common functions, what are used in most of our plugins are available in utils.helpers. These can be accessed like this:
```
const garie_plugin = require('garie-plugin');
options = {...};
garie_plugin.utils.helpers.getNewestFile(options);
```

The available functions are:
- pathNameFromUrl(url) - takes an url as parameter and returns the folder name built on it
- reportDir(options)	- takes an object as parameter and returns the folder name where the reports should be stored
	```		
		{
			app_name: string,
			url: string,
			app_root: string
		}
	```
- newestDir(options) - takes an object as parameter and returns the newest folder
	```		
		{
			app_name: string,
			url: string,
			app_root: string
		}
	```
- getNewestFile(options) - takes an object as parameter and returns the newest report file. Not the name of the file, but the contents of it
	```		
		{
			url: string,
			filename: string,
			reportDir: string,
		}
	```

- executeScript(options) - takes an object as parameter, executes a shell script, when the script is finished, it calls the "callback" method from the options, and returns the response of the callback method
	```		
		{
			script: string,
			url: string,
			reportDir: string,
			params: [], //optional
			callback: async function
		}
	```

## Implementing your plugin functionality
In the index.js we have the myGetData function. It receives as parameter an object with the structure:

```
	{
		url_settings:{
			url:string, // the url for which we are running our query
			<extra_options> // optional extra parameters
		},
		reportDir: string // location where the reports should be stored
	}
```
Now we have now 2 possibilities, we implement the query in nodejs, or we have a shell script (maybe with docker) we want to execute.
