const Influx = require('influx');
let database = null;

function init(db_name){
    database = db_name

    return new Influx.InfluxDB({
        host: process.env.HOST || 'localhost',
        database: db_name
    });
}

const create_db = async (influxdb) => {
    try {
        const names = await influxdb.getDatabaseNames();
        influxdb.getDatabaseNames().then(response => {
            console.log("Response = ", response)
        })
        if (names.indexOf(database) === -1) {
            console.log(`InfluxDB: ${database} database does not exist. Creating database`);
            return influxdb.createDatabase(database);
        }
        console.log('InfluxDB', `${database} database already exists. Skipping creation.`);
        return Promise.resolve();
    } catch (err) {
        console.log(err);
        return Promise.reject('Failed to initialise influx');
    }
}

const saveData = async (influxdb, url, measurement) => {
    try {
        const result = await influxdb.writePoints(measurement);
        console.log(`Successfully saved ${database} data for ${url}`);
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
        console.log(`Successfully marked ${database} data for ${url} as success`);
        return result;
    } catch (err) {
        console.log(`Failed to save data for ${url}`, err);
        return Promise.reject(`Failed to mark data into influxdb for ${url}`);
    }
}

module.exports = {
    init,
    create_db,
    saveData,
    markSuccess
}
