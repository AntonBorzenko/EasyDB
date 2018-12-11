'use strict';

const AppPatcher = require("./app-patcher").default;
const express = require('express');
const ExpressWs = require('express-ws');

let app = express();

ExpressWs(app); // patching routers and apps
app = AppPatcher.patch(app);

module.exports = app;