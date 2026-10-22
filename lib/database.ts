import mysql, {type Pool, type PoolConnection} from 'mysql2/promise';

// Retain the application's prepared-statement interface while moving storage to MySQL.
const schema = [
  'CREATE TABLE IF NOT EXISTS settings (id VARCHAR(191) PRIMARY KEY, value LONGTEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS records (`key` VARCHAR(255) PRIMARY KEY, generation VARCHAR(191) NOT NULL, kind VARCHAR(32) NOT NULL, id VARCHAR(191) NOT NULL, data LONGTEXT NOT NULL, INDEX records_generation_kind (generation,kind))',
  'CREATE TABLE IF NOT EXISTS events (id VARCHAR(191) PRIMARY KEY, created_at VARCHAR(32) NOT NULL)',
  'CREATE TABLE IF NOT EXISTS messages (id VARCHAR(191) PRIMARY KEY, customer VARCHAR(191) NOT NULL, state VARCHAR(32) NOT NULL, created_at VARCHAR(32) NOT NULL, INDEX messages_customer (customer,created_at))',
  'CREATE TABLE IF NOT EXISTS sessions (id VARCHAR(191) PRIMARY KEY, platform_user VARCHAR(191) NOT NULL, expires_at BIGINT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS login_attempts (id VARCHAR(191) PRIMARY KEY, attempts INT NOT NULL, window_start BIGINT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS contacts (id VARCHAR(191) PRIMARY KEY, customer VARCHAR(191) NOT NULL, kind VARCHAR(32) NOT NULL, note TEXT NOT NULL, created_at VARCHAR(32) NOT NULL, INDEX contacts_customer (customer,created_at))',
].map(sql => sql+' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin');

function translate(sql:string) {
  return sql.replace(/INSERT OR IGNORE/g,'INSERT IGNORE')
    .replace(/records\(key,/g,'records(`key`,')
    .replace(/ON CONFLICT\((?:id|key)\) DO UPDATE SET (value|data)=excluded\.(?:value|data)$/,
      'ON DUPLICATE KEY UPDATE $1=VALUES($1)');
}

class Statement {
  readonly owner:Database;
  readonly sql:string;
  readonly args:any[];
  constructor(owner:Database, sql:string, args:any[]=[]) {this.owner=owner;this.sql=sql;this.args=args}
  bind(...args:any[]) {return new Statement(this.owner,this.sql,args)}
  async first() {return (await this.owner.execute(this)).results[0]??null}
  async all() {return this.owner.execute(this)}
  async run() {return this.owner.execute(this)}
}

export class Database {
  private pool?:Pool;
  private ready?:Promise<void>;
  private connectionPool() {
    if(!this.pool) {
      for(const name of ['DB_HOST','DB_USER','DB_PASSWORD','DB_NAME']) {
        if(!process.env[name]) throw Object.assign(new Error('Configure o banco MySQL na Hostinger: '+name+'.'),{status:503});
      }
      this.pool=mysql.createPool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectionLimit:5,connectTimeout:10000,charset:'utf8mb4',flags:['-FOUND_ROWS'],supportBigNumbers:true});
    }
    return this.pool;
  }
  private async initialize() {
    const pool=this.connectionPool();
    this.ready??=(async()=>{for(const sql of schema)await pool.query(sql)})().catch(error=>{this.ready=undefined;throw error});
    await this.ready;
    return pool;
  }
  prepare(sql:string) {return new Statement(this,sql)}
  private async query(connection:PoolConnection,statement:Statement) {
    const {sql,args}=statement;
    if(sql.includes('RETURNING attempts')) {
      await connection.execute('INSERT INTO login_attempts(id,attempts,window_start) VALUES(?,1,?) ON DUPLICATE KEY UPDATE attempts=IF(window_start<=?,1,attempts+1), window_start=IF(window_start<=?,VALUES(window_start),window_start)',args);
      const [rows]=await connection.execute('SELECT attempts FROM login_attempts WHERE id=?',[args[0]]);
      return {results:rows as any[],meta:{changes:1}};
    }
    if(sql.includes('WHERE CAST(settings.value AS INTEGER)<?')) {
      // INSERT and conditional UPDATE share a row lock until this transaction commits.
      const [insert]:any=await connection.execute('INSERT IGNORE INTO settings(id,value) VALUES(?,?)',args.slice(0,2));
      if(insert.affectedRows)return {results:[],meta:{changes:1}};
      const [update]:any=await connection.execute('UPDATE settings SET value=? WHERE id=? AND CAST(value AS SIGNED)<?',[args[1],args[0],args[2]]);
      return {results:[],meta:{changes:update.affectedRows}};
    }
    const [result]:any=await connection.execute(translate(sql),args);
    return {results:Array.isArray(result)?result:[],meta:{changes:result.affectedRows??0}};
  }
  async execute(statement:Statement) {return (await this.batch([statement]))[0]}
  async batch(statements:Statement[]) {
    let connection:PoolConnection|undefined;
    try {
      connection=await (await this.initialize()).getConnection();
      await connection.beginTransaction();
      const results=[];
      for(const statement of statements)results.push(await this.query(connection,statement));
      await connection.commit();
      return results;
    } catch(error:any) {
      if(connection)await connection.rollback().catch(()=>{});
      if(error?.status)throw error;
      console.error('MySQL operation failed:',error?.code||'DATABASE_ERROR');
      throw Object.assign(new Error('Não foi possível acessar o banco MySQL. Confira a configuração do banco na Hostinger.'),{status:503});
    } finally {connection?.release()}
  }
  async close() {await this.pool?.end();this.pool=undefined;this.ready=undefined}
}
export const database=new Database();
