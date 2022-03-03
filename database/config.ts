import { parse } from "pg-connection-string"

// TODO: This came from a past project - I don't remember why I wrote this but let's explore later.
// We have to manually parse database URL because sequelize-typescript requires explicit
// connection parameters.

const { DB_URI, DB_MIN_POOL, DB_MAX_POOL } = process.env

if (!DB_URI) throw new Error("DB_URI is not defined")
const parsed = parse(DB_URI)

module.exports = {
  // Connection settings
  database: parsed.database || "isomercms_dev",
  host: parsed.host || "localhost",
  username: parsed.user,
  password: parsed.password,
  port: parsed.port || 5432,

  // Database settings
  dialect: "postgres",
  dialectOptions: {
    useUTC: false,
    timezone: "+08:00",
  },
  timezone: "+08:00",
  define: {
    underscored: true,
    charset: "utf8",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  pool: {
    min: DB_MIN_POOL ? parseInt(DB_MIN_POOL, 10) : 1,
    max: DB_MAX_POOL ? parseInt(DB_MAX_POOL, 10) : 10,
  },

  // Migrations and seeders options
  migrationStorage: "sequelize",
  migrationStorageTableName: "sequelize_migration_data",
  seederStorage: "sequelize",
  seederStorageTableName: "sequelize_seed_data",
}
