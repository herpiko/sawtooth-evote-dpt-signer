const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const ed25519 = require('ed25519');
const request = require('request');
const cbor = require('cbor')
const submit = require('./submitter/dpt-admin.js');
const app = express();
const port = process.env.PORT || 3000
const dptNode = process.argv[2];
if (!dptNode) throw("Please specify the node (node index host:port)");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

const privateKey = 'af9881fe34edfd3463cf3e14e22ad95a0608967e084d3ca1fc57be023040de590c32c468980d40237f4e44a66dec3beb564b3e1394a4c6df1da2065e3afc1d81';
const publicKey = '0c32c468980d40237f4e44a66dec3beb564b3e1394a4c6df1da2065e3afc1d81';
const pk = new Buffer(privateKey, 'hex');
const p = new Buffer(publicKey, 'hex');

// TODO mutual auth
//
app.get('/', (req, res) => {
  res.send('Evote');
});

app.post('/api/register', (req, res) => { // Restricted to DPT
  if (!req.body.r) return res.send({error : 'r is required'});
  if (!req.body.voterId) return res.send({error : 'voterId is required'});
  if (req.body.r.length != 16) return res.send({error : 'The length of random unique string must be 16'});
  console.log('Updating state for ' + req.body.voterId + '...');
  submit({voterId : req.body.voterId, verb : 'ready', node : dptNode})
  .then((result) => {
    console.log('Getting batches status on ' + JSON.parse(result).link + '...');
    setTimeout(() => { // wait a sec
      request.get({uri:JSON.parse(result).link}, (err, response) => {
        if (err) return res.send({error : err});
        if (JSON.parse(response.body).data[0].status != 'COMMITTED') {
          console.log(response.body);
          return res.send({error : JSON.parse(response.body).data[0].invalid_transactions[0].message});
        }
        console.log(JSON.parse(response.body).data[0].status);
        const msg = new Buffer(req.body.r);
        const signature = ed25519.Sign(msg, { privateKey: pk, publicKey: p });
        console.log('k value for ' + req.body.voterId + ' : ' + req.body.r + signature.toString('base64'));
        res.send({k : req.body.r + signature.toString('base64')});
      });
    }, 1000);
  })
  .catch((err) => {
    res.send({error : err});
  });
});

app.get('/api/dpt-transactions', (req, res) => { // Restricted to admin
  request.get({uri: 'http://' + dptNode + '/transactions'}, (err, resp) => {
    console.log(JSON.parse(resp.body).data.length);
    res.send(JSON.parse(resp.body));
  });
});

app.get('/api/dpt-dump', (req, res) => { // Restricted to admin
  // In real world, this handled by dedicated driver
  // See : https://sawtooth.hyperledger.org/docs/core/releases/1.0/app_developers_guide/event_subscriptions.html
  let obj = {
    data : [],
    total : 0,
  }
  let next = true;
  let promises = [];
  let nextUrl;

  var get = (next) => {
    let uri = next || 'http://' + dptNode + '/transactions?limit=100';
    console.log('Fetching ' + uri);
    request.get({uri: uri}, (err, resp) => {
      if (err) return j(err);
      let body = JSON.parse(resp.body);
      if (body.data && body.data.length > 0) {
        obj.total += body.data.length;
        for (var i in body.data) {
          let item = {};
          item['ledger'] = body.data[i].header.family_name;
          item['stateId'] = body.data[i].header.inputs[0];
          let buf = Buffer.from(body.data[i].payload, 'base64');
          let decoded = cbor.decode(buf);
          item['state'] = decoded.Value
          obj.data.push(item);
        }
      }
      if (body.paging && body.paging.next) {
        get(body.paging.next);
      } else {
        next = false;
        res.send(obj);
      }
    });
  }
  get();
});

app.get('/api/dpt-state/:id', (req, res) => {
  request.get({uri: 'http://' + dptNode + '/state/' + req.params.id}, (err, resp) => {
    if (err) return res.send({error : err});
    let body = JSON.parse(resp.body);
    let data = body.data;
    let buf = Buffer.from(data, 'base64');
    let decoded = cbor.decode(buf);
    decoded['head'] = body.head;
    res.send(decoded);
  });
});

app.listen(port);
console.log('Evote server started on port ' + port + ' against ledger ' + dptNode);
