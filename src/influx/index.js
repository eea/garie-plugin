const Influx = require('influx');

function init(db_name){

    let influxdb = new Influx.InfluxDB({
        host: process.env.HOST || process.env.INFLUX_HOST || 'localhost',
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



function tryMultipleTimes(f, reject_msg, count) {
    count = count || 5;
    reject_msg = reject_msg || "Something went wrong when writing into influxdb.";
    return new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
            try {
                const res = await f();
                clearInterval(interval);
                console.log(`At Try Multiple Times success: ${count}`);
                resolve(res);
                return;
            } catch (err) {
                count--;
                if (count <= 0) {
                    clearInterval(interval);
                    reject(reject_msg, err);
                    return;
                }
                console.log(`At Try Multiple Times fail: ${count}`, interval, err);
            }
        }, 1000);
    })

}


const saveData = async (influxdb, url, measurement) => {
    try {
//TODO: check why writePoints fails when too many plugins try to write simultaneously to influx
        const result = await tryMultipleTimes( async () => {
                return influxdb.writePoints(measurement);
            },
            `Failed to save ${url} data into ${measurement} at retry.`
        );
        console.log(`Successfully saved ${influxdb.config.database} data for ${url}`);
        return result;
    } catch (err) {
        console.log(`Failed to save data for ${url}`, err);
        return Promise.reject(`Failed to save data into influxdb for ${url}`);
    }
}

const savePoints = async (influxdb, points, option) => {
    try {
        const result = await tryMultipleTimes(
            async () => {
                return influxdb.writePoints(points);
            },
            `Failed to mark ${option} into ${points[0].measurement} at retry`,
        );
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
