import { TypeORMError } from "../../error"
import { DriverPackageNotInstalledError } from "../../error/DriverPackageNotInstalledError"
import { PlatformTools } from "../../platform/PlatformTools"
import { PostgresDriver } from "../postgres/PostgresDriver"
import type { ReplicationMode } from "../types/ReplicationMode"
import type { BunPostgresDataSourceOptions } from "./BunPostgresDataSourceOptions"
import { BunPostgresQueryRunner } from "./BunPostgresQueryRunner"

/**
 * Type cast wrapper
 */
abstract class PostgresWrapper extends PostgresDriver {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abstract createQueryRunner(mode: any): any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected abstract createPool(options: any, credentials: any): any
}

/**
 * Organizes communication with PostgreSQL DBMS using Bun.
 */
export class BunPostgresDriver extends PostgresWrapper {
    // -------------------------------------------------------------------------
    // Public Properties
    // -------------------------------------------------------------------------

    /**
     * Bun underlying library.
     */
    bun: typeof Bun

    master: Bun.SQL | undefined = undefined

    slaves: Bun.SQL[] = []

    // -------------------------------------------------------------------------
    // Public Implemented Properties
    // -------------------------------------------------------------------------

    options: BunPostgresDataSourceOptions

    // -------------------------------------------------------------------------
    // Public Implemented Methods
    // -------------------------------------------------------------------------

    /**
     * @param mode `master` or `slave`
     * @returns Query runner with given mode
     */
    createQueryRunner(mode: ReplicationMode): BunPostgresQueryRunner {
        return new BunPostgresQueryRunner(this, mode)
    }

    /**
     * @returns A client that wraps the single connection and the `release` method of it
     */
    async obtainMasterConnection(): Promise<[Bun.ReservedSQL, () => void]> {
        if (!this.master) throw new TypeORMError("Driver not Connected")
        const connection = await this.master.reserve()
        return [connection, () => connection.release()]
    }

    /**
     * @returns A client that wraps the single connection and the `release` method of it
     */
    async obtainSlaveConnection(): Promise<[Bun.ReservedSQL, () => void]> {
        if (!this.slaves.length) return this.obtainMasterConnection()
        const connection =
            await this.slaves[
                Math.floor(Math.random() * this.slaves.length)
            ].reserve()
        return [connection, () => connection.release()]
    }

    // -------------------------------------------------------------------------
    // Protected Methods
    // -------------------------------------------------------------------------

    protected loadDependencies() {
        try {
            this.bun = this.options.driver ?? PlatformTools.load("bun")
        } catch {
            throw new DriverPackageNotInstalledError("Bun", "bun")
        }
    }

    /**
     * @param options Unused
     * @param credentials The options for the SQL client
     * @returns A new SQL client instance
     */
    protected createPool(
        options: BunPostgresDataSourceOptions,
        credentials: Bun.SQL.PostgresOrMySQLOptions,
    ) {
        return new this.bun.SQL({
            ...credentials,
            onclose:
                credentials.onclose ??
                ((error: Error | null) => {
                    if (error) {
                        this.dataSource.logger.log(
                            "warn",
                            `Postgres connection closed with error. ${error}`,
                        )
                    } else {
                        this.dataSource.logger.log(
                            "info",
                            `Postgres connection closed.`,
                        )
                    }
                }),
            onconnect:
                credentials.onconnect ??
                ((error: Error | null) => {
                    if (error) {
                        this.dataSource.logger.log(
                            "warn",
                            `Postgres connection raised an error. ${error}`,
                        )
                    } else {
                        this.dataSource.logger.log(
                            "info",
                            `Postgres connection established.`,
                        )
                    }
                }),
        })
    }

    /**
     * @param pool `Bun.SQL` pool
     * @returns Promise that resolves once pool is closed
     */
    protected closePool(pool: Bun.SQL) {
        return pool.close()
    }

    /**
     * @param connection `Bun.SQL` connection
     * @param query Unsafe string
     * @returns Partial `pg.Result`
     */
    protected async executeQuery<T = unknown>(
        connection: Bun.SQL,
        query: string,
    ) {
        this.dataSource.logger.logQuery(query)
        const rows = await connection.unsafe<T[]>(query)
        return {
            rowCount: rows.length,
            rows,
        }
    }
}
