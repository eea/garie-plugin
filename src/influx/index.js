const Influx = require('influx');
//const logger = require('../utils/logger');

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
//            logger.info(`InfluxDB: ${influxdb.database} database does not exist. Creating database`);
            console.log(`InfluxDB: ${influxdb.options.database} database does not exist. Creating database`);
            return influxdb.createDatabase(influxdb.options.database);
        }
//        logger.info('InfluxDB', `${influxdb.database} database already exists. Skipping creation.`);
        console.log('InfluxDB', `${influxdb.options.database} database already exists. Skipping creation.`);
        return Promise.resolve();
    } catch (err) {
        console.log(err);
        return Promise.reject('Failed to initialise influx');
    }
}


module.exports = {
    init,
    create_db
}