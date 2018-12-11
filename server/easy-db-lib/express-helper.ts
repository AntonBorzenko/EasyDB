import {easyDb as easyDbConfig} from '../../config';

export type ExpressResolveFunction = (req, res, next) => object;

export class ExpressResult {
    data: any;
    status: number;
    constructor(data: any=undefined, status: number=200) {
        this.data = data;
        this.status = status;
    }
}

export class ExpressError extends Error {
    status: number;
    constructor(message: string=undefined, status: number=500, stack: any=undefined) {
        super(message || 'Internal error');
        this.status = status;
        if (stack) {
            this.stack = stack;
        }
    }
}

export let prepareExpressAnswer = (func: ExpressResolveFunction) => async (req, res, next) => {
    let result;
    try {
        result = await func(req, res, next);
        if (!(result instanceof ExpressResult) && !(result instanceof ExpressError)) {
            result = new ExpressResult(result);
        }
    }
    catch (error) {
        if (error instanceof ExpressError) {
            result = error;
        }
        else {
            if (easyDbConfig.throwErrors) {
                throw error;
            }
            result = new ExpressError(error.message, 500, error.stack);
        }
    }

    if (result instanceof ExpressResult) {
        await res.status(result.status).json({
            status : true,
            result : result.data || undefined,
        });
    } else {
        await res.status(result.status).json({
            status : false,
            message : result.message,
            stack : easyDbConfig.debug ? result.stack : undefined,
        });
    }
}