const Influx = require('influx');

function init(db_name){

    let influx = new Influx.InfluxDB({
        host: process.env.INFLUX_HOST || 'localhost',
        port: process.env.INFLUX_PORT || 8086,
        database: db_name,
        username: process.env.INFLUX_USERNAME || '',
        password: process.env.INFLUX_PASSWORD || '',
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

const markSuccess = async (influxdb, url) => {
    try {
        const measurement = [ { measurement: 'success',
            tags: { url: url },
            fields: { success: true } } ];
        const result = await influxdb.writePoints(measurement);
        console.log(`Successfully marked ${influxdb.config.database} data for ${url} as success`);
        return result;
    } catch (err) {
        console.log(`Failed to save data for ${url}`, err);
        return Promise.reject(`Failed to mark data into influxdb for ${url}`);
    }
}

/*
   state = {0, 1, 2}
   0 -> in process
   1 -> finished successfully
   2 -> failed
*/
const markStatus = async (influxdb, url, state, timestamp, retry) => {
    try {
        const measurement = [ {
            measurement: "status",
            tags: { url: url, state: state },
            fields: { retry: retry }           
        }];

        const result = await influxdb.writePoints(measurement);
        console.log(`Successfully added the state ${state} for ${url}`);
        return result;
    } catch (err) {
        console.log(`Failed to add the state for ${url}`);
        return Promise.reject(`Failed to add data to status.`)
    }
}

// steps = {START, WAITING, RETRY 1, RETRY 2, ..., FINISHED}
const markStatusLogs = async (influxdb, step, timestamp) => {
    try {
        const measurement = [ {
            measurement: "status-logs",
            tags: {step: step },
            fields: { date: timestamp }
        }];

        const result = await influxdb.writePoints(measurement);
        console.log(`Successfully added step ${step}`);
        return result;
    } catch (err) {
        console.log(`Failed to add step ${step}`);
        return Promise.reject(`Failed to add step ${step}.`)
    }
}

module.exports = {
    init,
    list_db,
    create_db,
    saveData,
    markSuccess,
    markStatus,
    markStatusLogs
}
