
# Generic garie plugin package

## Setting up the repo:
Create a github repo for your plugin, for the tutorial we will call it: "my_garie_plugin"
Copy the contents of https://github.com/eea/garie-plugin/tree/master/skelet into your repo.
Look for <my_garie_plugin> and modify it for your plugin.

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
- reportDirNow(reportDir) - takes the folder name and generates a new foldername with the current time
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
There are 2 ways to make the queries for the urls
1. with **nodejs** code, in which case the logic should be implemented entirely using javascript
2. with a **shell script**, in which case in the shell script any external tool (even a docker run command) can be executed. In this case we have a helper function: **executeScript** what is recommended to be used (see inside the myGetData function in https://github.com/eea/garie-plugin/blob/master/skelet/src/index.js) .
In both cases, **nodejs** or **shell script**, the myGetData function should return an object with the form:
	```
	{
		'<my_measurement>': '<value>'
	}
	```
	If for some reason your structure is different, ex. there are more values to be stored, you have to implement your specific, myGetMeasurement function. It should return an object with the form:
	```
		[
			{
				"fields":{
					"sentry_events":2,
					"total_visits":100,
					"value":2
				},
				"measurement":"JsEvents/TotalVisits",
				"tags":{
					"url":"www.test.com"
				}
		},
		{
			"fields":{
				"sentry_events":2,
				"total_visits":100,
				"value":2
			},
			"measurement":"ServerErrors/TotalVisits",
			"tags":{
				"url":"www.test.com"
			}
		}
	]
	```

## Hints for developing the plugin:

While developing the plugin you can use the docker-compose-dev.yml.
It will:
	- build locally the image for the plugin;
	- mount your source code and local config.json inside your container, so it can be tested without rebuilding and restarting the image;
	- instead of starting the app, and crashing if something wrong, just starts the container, with a 'bash -c "tail -f /dev/null"' command, what will keep the container alive.

In a terminal (#1) you can start the container with:
```
docker-compose -f docker-compose-dev.yml up
```
In another terminal (#2):
```
docker-compose -f docker-compose-dev.yml exec <my_garie_plugin> bash
```
On your host you can modify the source code and on terminal #2 you can manually start the plugin with
```
npm start
```
