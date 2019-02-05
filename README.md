

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
