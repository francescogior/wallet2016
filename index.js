"use strict";

// confing
const config = require('./config.json');

// ext modules deps
const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose')
const _ = require('lodash');

// int modules deps
const parser = require('./parser');
const parse = parser.parser.parse;
const parseAndCompute = parser.parseAndCompute;

// app init
const app = express();

// all environments
app.set('port', process.env.PORT || 4242);
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

// db
mongoose.connect(config.dbUrl);

// models
const Line = require('./models/line');

// // methods
// const getLines = (method = () => {}) => Lines.find((err, lines) => err ? console.log(err) : method(lines.map(l => l.text)))
//
// const validateLine = (line) => {
//   getLines((lines) => parser(lines.concat(line).join('\n')))
// }

const toDisplay = line => `${line.text} - ${line.createdAt} - ${line._id}`
const filterZeroes = obj => _.pickBy(obj, v => v !== 0)
const sumValues = (obj1, obj2) => Object.assign({},
  _.mapValues(obj1, (value, key) => value + (obj2 ? (obj2[key] || 0) : 0)),
  _.mapValues(obj2, (value, key) => value + (obj1 ? (obj1[key] || 0) : 0))
)

const calculateBalance = (stepBalances) => stepBalances.reduce((acc, comp) => ({
  balance: sumValues(acc.balance, comp.computed.balance),
  given: sumValues(acc.given, comp.computed.given),
  spent: sumValues(acc.spent, comp.computed.spent)
}), { balance: {}, given: {}, spent: {} })

const displayBalance = (balanceObj) => _.map(balanceObj, (value, person) => `__${person}__: ${value}€`)

// routes
app.post("/", function(req, res) {
  const text = req.body.text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>');
  console.log({ text });
  Line.find((err, lines) => {
    if (err) {
      return res.json({ err });
    }
    if (text.startsWith('@people ')) {
      if (lines.length !== 0) {
        return res.json({ err: 'Per ora non gestiamo il cambiamento di @people sorry about that' });
      }
      return Line.create({ text }, (err, line) => err ? res.json({ err }) : res.json({ success: 'pad created', people: text.slice('@people '.length) }));
    }
    const toParse = lines.map(l => l.text).concat(text).join('\n');
    const computations = parseAndCompute(toParse);
    return Line.create({ text }, (err, line) => err ? res.json({ err }) : res.json({
      lastLineAdded: toDisplay(line),
      lastTransactionBalance: _.mapValues(_.last(computations).computed, filterZeroes),
      text: `LINE ADDED: _${toDisplay(line)}_\BALANCE:\n${displayBalance(calculateBalance(computations).balance).join('\n')}`,
      balance: calculateBalance(computations)
    }));
  })
});

app.get("/", function(req, res) {
  Line.find((err, lines) => err ? console.log(err) : res.json({
    lines: lines.map(toDisplay),
    balance: calculateBalance(parseAndCompute(lines.map(l => l.text).join('\n')))
  }));
});

// launch server
http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
