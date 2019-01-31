const Influx = require('influx');

function init(db_name){
    return new Influx.InfluxDB({
        host: process.env.HOST || 'localhost',
        database: db_name
    });
}

const create_db = async (influxdb) => {
    try {
        const names = await influxdb.getDatabaseNames();
        if (names.indexOf(influxdb.options.database) === -1) {
            console.log(`InfluxDB: ${influxdb.options.database} database does not exist. Creating database`);
            return influxdb.createDatabase(influxdb.options.database);
        }
        console.log('InfluxDB', `${influxdb.options.database} database already exists. Skipping creation.`);
        return Promise.resolve();
    } catch (err) {
        console.log(err);
        return Promise.reject('Failed to initialise influx');
    }
}

const saveData = async (influxdb, url, measurement) => {
    try {
        const result = await influxdb.writePoints(measurement);
        console.log(`Successfully saved ${influxdb.options.database} data for ${url}`);
        return result;
    } catch (err) {
        console.log(`Failed to save data for ${url}`, err);
        return Promise.reject(`Failed to save data into influxdb for ${url}`);
    }
}

module.exports = {
    init,
    create_db,
    saveData
}