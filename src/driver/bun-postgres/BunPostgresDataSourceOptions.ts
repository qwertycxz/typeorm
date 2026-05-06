import type { BaseDataSourceOptions } from "../../data-source/BaseDataSourceOptions"
import type { ReplicationMode } from "../types/ReplicationMode"

/**
 * Postgres-specific connection options.
 */
export interface BunPostgresDataSourceOptions
    extends BaseDataSourceOptions, Bun.SQL.PostgresOrMySQLOptions {
    /**
     * Database type.
     */
    readonly type: "bun-postgres"

    /**
     * Schema name.
     */
    readonly schema?: string

    /**
     * The driver object
     * This defaults to `require("bun")`.
     */
    readonly driver?: typeof Bun

    /**
     * A boolean determining whether to pass time values in UTC or local time. (default: false).
     */
    readonly useUTC?: boolean

    /**
     * Replication setup.
     */
    readonly replication?: {
        /**
         * Master server used by orm to perform writes.
         */
        readonly master: Bun.SQL.PostgresOrMySQLOptions

        /**
         * List of read-from servers (slaves).
         */
        readonly slaves: Bun.SQL.PostgresOrMySQLOptions[]

        /**
         * Default connection pool to use for SELECT queries
         *
         * @default "slave"
         */
        readonly defaultMode?: ReplicationMode
    }

    /**
     * The Postgres extension to use to generate UUID columns. Defaults to uuid-ossp.
     * If pgcrypto is selected, TypeORM will use the gen_random_uuid() function from this extension.
     * If uuid-ossp is selected, TypeORM will use the uuid_generate_v4() function from this extension.
     */
    readonly uuidExtension?: "pgcrypto" | "uuid-ossp"

    /**
     * Automatically install postgres extensions
     */
    readonly installExtensions?: boolean

    /**
     * List of additional Postgres extensions to be installed in the database.
     */
    readonly extensions?: string[]
}
