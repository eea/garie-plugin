
const TIME_IN_SECONDS = 1000000000;
const TIME_IN_NANOS = 1000000;

async function getCurrentChecks(influx, waitingTimestamp, startTimestamp, database) {
    let runningChecks = [];
    let failedChecks = [];
    if (database === undefined) {
        runningChecks = await influx.query(`select * from status where state=\'1\' or state=\'2\' and time<=${waitingTimestamp} and time>=${startTimestamp}`);
        failedChecks = await influx.query(`select * from status where state=\'2\' and time<=${waitingTimestamp} and time>=${startTimestamp}`);
    } else {
        runningChecks = await influx.query(`select * from status where state=\'1\' or state=\'2\' and time<=${waitingTimestamp} and time>=${startTimestamp}`, { database });
        failedChecks = await influx.query(`select * from status where state=\'2\' and time<=${waitingTimestamp} and time>=${startTimestamp}`, { database });
    }
    const duration = (waitingTimestamp - startTimestamp) / TIME_IN_SECONDS;

    const currentChecks = {
        runningChecks: runningChecks.length,
        failedChecks: failedChecks.length,
        startTime: startTimestamp,
        duration: duration
    }

    return currentChecks;
}


async function getCurrentRetries(influx, waitingTimestamp, statusLogsRows, database) {
  const retries = [];
  if (statusLogsRows.length === 0) {
    return {retries};
  }

  let runningRetries = [];
  if (database === undefined) {
      runningRetries = await influx.query(`select * from status where state=\'1\' or state=\'2\' and time > ${waitingTimestamp}`);
  } else {
      runningRetries = await influx.query(`select * from status where state=\'1\' or state=\'2\' and time > ${waitingTimestamp}`, { database });
  }
  for (let i = 0; i < statusLogsRows.length - 1; i++) {
    if (statusLogsRows[i].step.includes("RETRY")) {
      retries.push({
        duration: (statusLogsRows[i + 1].time.getNanoTime() - statusLogsRows[i].time.getNanoTime()) / TIME_IN_SECONDS,
        success: 0,
        fail : 0
      });
    }
  }
    if (statusLogsRows[statusLogsRows.length - 1].step.includes("RETRY")) {
      retries.push({
        duration: (Date.now() * TIME_IN_NANOS - statusLogsRows[statusLogsRows.length - 1].time.getNanoTime()) / TIME_IN_SECONDS,
        success: 0,
        fail : 0
      })
    }
  
  for (let row of runningRetries) {
    if (row.state == 1) {
      retries[row.retry - 1].success++;
      
    } else if(row.state == 2) {
      retries[row.retry - 1].fail++;
    }
  }

  const currentRetries = {
    retries
  };

  return currentRetries;
}

async function makeStatusTables( res, influx, database ) {
  const defaultMessage = "Plugin has not started yet.";

  let tablesToShow = {
    first: false,
    retries: false,
    finish: false
  };
  let statusLogsQuery = [];
  if (database === undefined) {
      statusLogsQuery = await influx.query('select last(*) from "status-logs" group by step order by time asc');
  } else {
      statusLogsQuery = await influx.query('select last(*) from "status-logs" group by step order by time asc', { database });
  }

  if (statusLogsQuery.length === 0) {
    return res.render('status.html', { defaultMessage });
  }
  statusLogsQuery.sort((a, b) => {
    return a.time.getNanoTime() - b.time.getNanoTime();
  });

  const idx = statusLogsQuery.findIndex(elem => elem.step === "START");
  const statusLogsRows = statusLogsQuery.slice(idx);
  const startTimestamp = statusLogsRows[0].time.getNanoTime();
  const startTime = statusLogsRows[0].time.toISOString();

  let waitingTimestamp = Date.now() * TIME_IN_NANOS;
  if (statusLogsRows.length >= 2) {
    waitingTimestamp = statusLogsRows[1].time.getNanoTime();
  }

  const urlsQuery = await influx.query(`select count(*) from status where time <= ${waitingTimestamp} and time >= ${startTimestamp} and state = '0'`, { database })
  const nrUrls = urlsQuery[0].count_retry;

  const currentlyRunningChecksTable = await getCurrentChecks(influx, waitingTimestamp, startTimestamp, database);
  const currentlyRunningRetriesTable = await getCurrentRetries(influx, waitingTimestamp, statusLogsRows.slice(2), database);

  if (statusLogsRows[statusLogsRows.length - 1].step === "START" ||
      statusLogsRows[statusLogsRows.length - 1].step === "WAITING") {

    tablesToShow.first = true;
    return res.render('status.html', { nrUrls, currentlyRunningChecksTable, tablesToShow });
      
  } else if (statusLogsRows[statusLogsRows.length - 1].step.includes("RETRY")) {
  
    tablesToShow.first = true;
    tablesToShow.retries = true;
    return res.render('status.html', { nrUrls, currentlyRunningChecksTable, currentlyRunningRetriesTable, tablesToShow });

  } else if (statusLogsRows[statusLogsRows.length - 1].step === "FINISHED") {
    
    const finishTime = statusLogsRows[statusLogsRows.length - 1].time.getNanoTime();
    const totalRunningTime = (finishTime - startTimestamp) / TIME_IN_SECONDS;

    let successful = [];
    if (database === undefined) {
      successful = await influx.query(`select * from success where time>=${startTimestamp}`);      
    } else {
      successful = await influx.query(`select * from success where time>=${startTimestamp}`, { database });      
    }
  const countSuccess = successful.length;


    tablesToShow.first = true;
    tablesToShow.retries = true;
    tablesToShow.finish = true;
    return res.render('status.html', { nrUrls, currentlyRunningChecksTable, currentlyRunningRetriesTable,
      startTime, totalRunningTime, countSuccess, tablesToShow });
  }
  return res.render('status.html', { defaultMessage });
}

module.exports = {
  makeStatusTables
}