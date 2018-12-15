import * as express from 'express';
import {ExpressError} from "./easy-db-lib/express-helper";
const express = require('express');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

export default class AppPatcher {
    static patch(app: express): express {
        app.use(logger('dev'));
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({extended: false}));
        app.use(cookieParser());

        app.use(function (req, res, next) {
            if (req.method === 'OPTIONS') {
                console.log('!OPTIONS');
                var headers = {};
                // IE8 does not allow domains to be specified, just the *
                // headers["Access-Control-Allow-Origin"] = req.headers.origin;
                headers["Access-Control-Allow-Origin"] = "*";
                headers["Access-Control-Allow-Methods"] = "POST, GET, PUT, DELETE, OPTIONS";
                headers["Access-Control-Allow-Credentials"] = false;
                headers["Access-Control-Max-Age"] = '86400'; // 24 hours
                headers["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept";
                res.writeHead(200, headers);
                res.end();
                return;
            }
            next();
        });

        app.use(function (req, res, next) {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', '*');
            res.header('Access-Control-Allow-Headers', 'X-Requested-With');

            next();
        });

        let easyDbRouter = require('./easy-db-lib/router');
        app.use('/easy-db', easyDbRouter);

        app.use(function (req, res, next) {
            let err = new ExpressError('Not found', 404);
            next(err);
        });

        app.use(function (err, req, res) {
            res.locals.message = err.message;
            res.locals.error = req.app.get('env') === 'dev' ? err : {};

            res.status(err.status || 500);
            res.render('error');
        });

        return app;
    }
}