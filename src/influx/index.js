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

module.exports = {
    init,
    create_db,
    saveData,
    markSuccess
}
