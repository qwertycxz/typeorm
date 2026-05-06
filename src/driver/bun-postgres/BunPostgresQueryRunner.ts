import { TypeORMError } from "../../error"
import { QueryFailedError } from "../../error/QueryFailedError"
import { QueryRunnerAlreadyReleasedError } from "../../error/QueryRunnerAlreadyReleasedError"
import { QueryResult } from "../../query-runner/QueryResult"
import { BroadcasterResult } from "../../subscriber/BroadcasterResult"
import { PostgresQueryRunner } from "../postgres/PostgresQueryRunner"
import type { ReplicationMode } from "../types/ReplicationMode"
import type { BunPostgresDriver } from "./BunPostgresDriver"

abstract class PostgresWrapper extends PostgresQueryRunner {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    driver: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(driver: any, mode: any) {
        super(driver, mode)
    }
}

/**
 * Runs queries on a single postgres database connection.
 */
export class BunPostgresQueryRunner extends PostgresWrapper {
    // -------------------------------------------------------------------------
    // Public Implemented Properties
    // -------------------------------------------------------------------------

    driver: BunPostgresDriver

    // -------------------------------------------------------------------------
    // Protected Properties
    // -------------------------------------------------------------------------

    protected databaseConnection: Bun.ReservedSQL

    protected releaseCallback?: () => void

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param driver Bun driver used by connection
     * @param mode `master` or `slave`
     */
    constructor(driver: BunPostgresDriver, mode: ReplicationMode) {
        super(driver, mode)
    }

    // -------------------------------------------------------------------------
    // Public Methods
    // -------------------------------------------------------------------------

    /**
     * @returns The database connection
     */
    async connect() {
        if (this.databaseConnection) return this.databaseConnection
        if (this.driver.isReplicated && this.mode == "slave") {
            ;[this.databaseConnection, this.releaseCallback] =
                await this.driver.obtainSlaveConnection()
        } else {
            ;[this.databaseConnection, this.releaseCallback] =
                await this.driver.obtainMasterConnection()
        }
        return this.databaseConnection
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    async release() {
        this.isReleased = true
        this.releaseCallback?.()
    }

    /**
     * @param query Unsafe string
     * @param parameters Array to replace `$1`, `$2`, etc
     * @param useStructuredResult Whether to return `QueryResult` or raw data returned by the driver. Defaults to `false`
     * @returns The `QueryResult`
     */
    query<T = unknown>(
        query: string,
        parameters: unknown[],
        useStructuredResult: true,
    ): Promise<QueryResult<T>>
    /**
     * @param query Unsafe string
     * @param parameters Array to replace `$1`, `$2`, etc
     * @param useStructuredResult Whether to return `QueryResult` or raw data returned by the driver. Defaults to `false`
     * @returns Raw data returned by the driver
     */
    query<T = unknown>(
        query: string,
        parameters?: unknown[],
        useStructuredResult?: false,
    ): Promise<T[]>
    /**
     * @param query Unsafe string
     * @param parameters Array to replace `$1`, `$2`, etc
     * @param useStructuredResult Whether to return `QueryResult` or raw data returned by the driver. Defaults to `false`
     * @returns The `QueryResult` if `useStructuredResult` is `true`, otherwise raw data returned by the driver
     */
    async query<T = unknown>(
        query: string,
        parameters?: unknown[],
        useStructuredResult: boolean = false,
    ) {
        if (this.isReleased) throw new QueryRunnerAlreadyReleasedError()
        await this.broadcaster.broadcast("BeforeQuery", query, parameters)
        this.driver.dataSource.logger.logQuery(query, parameters, this)

        const broadcaster = new BroadcasterResult()
        try {
            const start = Date.now()
            const rows = await (
                await this.connect()
            ).unsafe<T[]>(query, parameters)
            const end = Date.now()

            // log slow queries if maxQueryExecution time is set
            if (
                this.driver.options.maxQueryExecutionTime &&
                end > start + this.driver.options.maxQueryExecutionTime
            ) {
                this.driver.dataSource.logger.logQuerySlow(
                    end - start,
                    query,
                    parameters,
                    this,
                )
            }

            this.broadcaster.broadcastAfterQueryEvent(
                broadcaster,
                query,
                parameters,
                true,
                end - start,
                rows,
                undefined,
            )

            if (!useStructuredResult) return rows
            const result = new QueryResult<T>()
            result.affected = rows.length
            result.raw = rows
            result.records = rows
            return result
        } catch (error) {
            this.broadcaster.broadcastAfterQueryEvent(
                broadcaster,
                query,
                parameters,
                false,
                undefined,
                undefined,
                error,
            )

            this.driver.dataSource.logger.logQueryError(
                error,
                query,
                parameters,
                this,
            )
            throw new QueryFailedError(query, parameters, error)
        } finally {
            await broadcaster.wait()
        }
    }

    // eslint-disable-next-line jsdoc/require-param
    /**
     * Not implemented: Stream is not supported by Bun driver
     *
     * @see https://github.com/oven-sh/bun/issues/17181
     */
    stream(
        _query: string,
        _parameters?: unknown[],
        _onEnd?: unknown,
        _onError?: unknown,
    ): never {
        throw new TypeORMError(
            `Stream is not supported by Bun driver: https://github.com/oven-sh/bun/issues/17181`,
        )
    }
}
