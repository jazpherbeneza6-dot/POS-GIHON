const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'inventory_db',
    user: 'postgres',
    password: '123123123',
});

(async () => {
    try {
        await pool.query("ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS receive_status VARCHAR(50) DEFAULT 'Received'");
        await pool.query("ALTER TABLE sales_returns ADD COLUMN IF NOT EXISTS refund_status VARCHAR(50) DEFAULT 'Pending'");
        console.log('Columns added successfully');
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
        process.exit(0);
    }
})();
