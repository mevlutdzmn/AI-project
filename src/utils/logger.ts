import { Logger as NestLogger } from '@nestjs/common';

/**
 * Custom logger wrapper
 */
export class AppLogger {
    private logger: NestLogger;

    constructor(context: string) {
        this.logger = new NestLogger(context);
    }

    log(message: string, ...optionalParams: any[]) {
        this.logger.log(message, ...optionalParams);
    }

    error(message: string, trace?: string, ...optionalParams: any[]) {
        this.logger.error(message, trace, ...optionalParams);
    }

    warn(message: string, ...optionalParams: any[]) {
        this.logger.warn(message, ...optionalParams);
    }

    debug(message: string, ...optionalParams: any[]) {
        this.logger.debug(message, ...optionalParams);
    }

    verbose(message: string, ...optionalParams: any[]) {
        this.logger.verbose(message, ...optionalParams);
    }
}
