import { Router } from 'express';
import EasyDbModel from './easy-db-model';
import { prepareExpressAnswer, ExpressResult, ExpressError } from './express-helper';
import {Operation} from "fast-json-patch";
import * as Debug from 'debug';
import { ConnectionsHandler } from './websocket-helper';

let debug = Debug('easy-db:server');
let router = Router();
let easyDb = new EasyDbModel();

router.get('/data', prepareExpressAnswer(async (): Promise<object> => {
    return await easyDb.getData();
}));

router.post('/data', prepareExpressAnswer(async (req): Promise<ExpressResult> => {
    let data = req.body;
    if (!data) {
        throw new ExpressError('parameter "data" is not found', 400);
    }
    await easyDb.setData(data);

    return new ExpressResult(undefined, 201);
}));

router.post('/dataUpdates', prepareExpressAnswer(async (req): Promise<ExpressResult> => {
    let updates: Operation[] = req.body.updates;
    if (!Array.isArray(updates)) {
        throw new ExpressError("Parameter 'updates' is not defined", 400);
    }
    let previousHash:number = typeof(req.body.previousHash) === 'number' ? req.body.previousHash : undefined;

    await easyDb.updateData(updates, previousHash);

    return new ExpressResult(undefined, 201);
}));

if (router.ws) {
    debug('WebSocket support is enabled');
    let connectionsHandler = new ConnectionsHandler();
    // noinspection JSUnusedLocalSymbols
    router.ws('/updates', (ws, req) => {
        let wsId: number = connectionsHandler.add(ws);
        ws.on('close', function () {
            connectionsHandler.remove(wsId);
        });
    });

    easyDb.onUpdate((type, data, previousHash) => {
        let message = JSON.stringify({ method : type, data, previousHash });
        connectionsHandler.getConnectionsArray().forEach(ws => {
            ws.send(message);
        });
    });
}
else {
    debug('WebSocket support is not enabled');
}

module.exports = router;