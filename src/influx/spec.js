const { saveData, create_db } = require('./index');

let db = {
    options:{database: "test_db"},
    getDatabaseNames: jest.fn(),
    createDatabase: jest.fn(),
    writePoints: jest.fn()
}

describe('influxdb', () => {
    beforeEach(() => {
        db.getDatabaseNames.mockClear();
        db.createDatabase.mockClear();
        db.writePoints.mockClear();
    });
    describe('init', () => {
        it('gets the names of the databases and creates a `test_db` database if one does not already exist', async () => {

            db.getDatabaseNames.mockResolvedValue(['database1', 'database2']);
            await create_db(db);

            expect(db.createDatabase).toBeCalledWith('test_db');
        });

        it('gets the names of the databases and does not create a `test_db` database if one already exists', async () => {
            db.getDatabaseNames.mockResolvedValue(['database1', 'test_db']);

            await create_db(db);

            expect(db.createDatabase).not.toHaveBeenCalled();
        });

        it('rejects when failing to get database names from influx', async () => {
            db.getDatabaseNames.mockRejectedValue();

            return expect(create_db('test_db')).rejects.toMatch('Failed to initialise influx');
        });
    });

    describe('saveData', () => {
        it('writes influxdb points into the database for each property on a given object if it has values', async () => {
            const result = await saveData(db, 'https://www.test.com',  [
                {
                    measurement: 'firstname',
                    tags: {
                        url: 'https://www.test.com'
                    },
                    fields: {
                        value: 'bob'
                    }
                }
            ]);

            expect(db.writePoints).toHaveBeenCalledWith([
                {
                    measurement: 'firstname',
                    tags: {
                        url: 'https://www.test.com'
                    },
                    fields: {
                        value: 'bob'
                    }
                }
            ]);
        });


        it('rejects when writePoints fails to write into influxdb', async () => {
            db.writePoints.mockRejectedValue();
            await expect(saveData(db, 'https://www.test.co.uk', [
                {
                    measurement: 'firstname',
                    tags: {
                        url: 'https://www.test.com'
                    },
                    fields: {
                        value: 'bob'
                    }
                }
            ])).rejects.toEqual('Failed to save data into influxdb for https://www.test.co.uk');
        });
    });
});
