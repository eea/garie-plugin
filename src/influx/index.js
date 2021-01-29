const Influx = require('influx');

function init(db_name){
    let influxdb = new Influx.InfluxDB({
        host: process.env.HOST || 'localhost',
        database: db_name
    });

    influxdb.config = {}
    influxdb.config.database = db_name
    
    return influxdb
}

const list_db = async (influxdb) => {
    try {
        const names = await influxdb.getDatabaseNames();
        return Promise.resolve();
    } catch (err) {
        console.log(err);
        return Promise.reject('Failed to connect to influx')
    }
}

const create_db = async (influxdb) => {
    try {
        const names = await influxdb.getDatabaseNames();
        if (names.indexOf(influxdb.config.database) === -1) {
            console.log(`InfluxDB: ${influxdb.config.database} database does not exist. Creating database`);
            return influxdb.createDatabase(influxdb.config.database);
        }
        console.log('InfluxDB', `${influxdb.config.database} database already exists. Skipping creation.`);
        return Promise.resolve();
    } catch (err) {
        console.log(err);
        return Promise.reject('Failed to initialise influx');
    }
}

const saveData = async (influxdb, url, measurement) => {
    try {
//TODO: check why writePoints fails when too many plugins try to write simultaneously to influx
        const result = await influxdb.writePoints(measurement);
        console.log(`Successfully saved ${influxdb.config.database} data for ${url}`);
        return result;
    } catch (err) {
        console.log(`Failed to save data for ${url}`, err);
        return Promise.reject(`Failed to save data into influxdb for ${url}`);
    }
}

const savePoints = async (influxdb, points, option) => {
    try {
        const result = await influxdb.writePoints(points);
        console.log(`Successfully saved data for ${option} into ${points[0].measurement}.`);
        return result;
    } catch (err) {
        console.log(`Failed to mark point into ${points[0].measurement}`, err);
        return Promise.reject(`Failed to mark data into influxdb for ${points[0].measurement}`);
    }
}

const markSuccess = (url) => {
    const measurement =  { measurement: 'success',
        tags: { url: url },
        fields: { success: true } };
    return measurement;
}



/*
   state = {0, 1, 2}
   0 -> in process
   1 -> finished successfully
   2 -> failed
*/
const markStatus = (url, state, retry) => {
    const measurement =  {
        measurement: "status",
        tags: { url: url, state: state },
        fields: { retry: retry }
    };

    return measurement;
}


const markStatusLogs = (step, timestamp) => {
    const measurement = {
        measurement: "status-logs",
        tags: {step: step},
        fields: { date: timestamp }
    };
    return measurement;
}


const markAllUrls = (allUrls) => {
    const measurement = {
        measurement: "nrUrls",
        tags: {allUrls : allUrls},
        fields: { date: Date.now() }
    };

    return measurement;
}



module.exports = {
    init,
    list_db,
    create_db,
    saveData,
    markSuccess,
    markStatus,
    markStatusLogs,
    markAllUrls,
    savePoints
}
